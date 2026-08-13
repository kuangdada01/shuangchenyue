package com.mimo.app;

import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.appcompat.app.AppCompatDelegate;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewLocalServer;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MimoTheme";

    private String currentThemeMode = "system";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // 必须在 super.onCreate() 之前设置，让 AppCompat 自动处理系统夜间模式变化
        AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM);
        Log.d(TAG, ">>> onCreate START");
        super.onCreate(savedInstanceState);

        try {
            WebView webView = getBridge().getWebView();
            final Bridge bridge = getBridge();
            final WebViewLocalServer localServer = bridge.getLocalServer();

            Log.d(TAG, "  localServer=" + (localServer != null ? "OK" : "NULL"));

            webView.addJavascriptInterface(this, "AndroidBridge");

            webView.getSettings().setBuiltInZoomControls(false);
            webView.getSettings().setDisplayZoomControls(false);
            webView.getSettings().setSupportZoom(false);

            webView.setBackgroundColor(Color.TRANSPARENT);

            webView.setWebViewClient(new WebViewClient() {
                @Override
                public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                    WebResourceResponse resp = localServer.shouldInterceptRequest(request);
                    if (resp == null && request.isForMainFrame()) {
                        Log.w(TAG, "  shouldInterceptRequest: MAIN FRAME NOT INTERCEPTED! url=" + request.getUrl());
                    }
                    return resp;
                }

                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    return bridge.launchIntent(request.getUrl());
                }

                @Override
                public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                    Log.e(TAG, "  onReceivedError: " + error.getDescription() + " url=" + request.getUrl());
                    super.onReceivedError(view, request, error);
                    String errorPath = bridge.getErrorUrl();
                    if (errorPath != null && request.isForMainFrame()) {
                        view.loadUrl(errorPath);
                    }
                }

                @Override
                public void onPageStarted(WebView view, String url, Bitmap favicon) {
                    super.onPageStarted(view, url, favicon);
                    Log.d(TAG, "  onPageStarted: " + url);
                }

                @Override
                public void onPageFinished(WebView view, String url) {
                    super.onPageFinished(view, url);
                    Log.d(TAG, "  onPageFinished: " + url + " (will apply theme in 500ms)");
                    // 首次应用透明状态栏，防止启动闪屏后透出系统默认底色
                    runOnUiThread(() -> ensureTransparentStatusBar());
                    new Handler(Looper.getMainLooper()).postDelayed(() -> {
                        Log.d(TAG, "  onPageFinished+500ms: applying theme from storage");
                        applyThemeFromStorage(view);
                    }, 500);
                }
            });
            Log.d(TAG, ">>> onCreate END (WebViewClient installed)");
        } catch (Exception e) {
            Log.e(TAG, ">>> onCreate ERROR", e);
            e.printStackTrace();
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        Log.d(TAG, ">>> onResume: re-applying theme");
        try {
            WebView webView = getBridge().getWebView();
            applyThemeFromStorage(webView);
        } catch (Exception e) {
            Log.e(TAG, ">>> onResume ERROR", e);
        }
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        Log.d(TAG, ">>> onConfigurationChanged: uiMode=" + (newConfig.uiMode & Configuration.UI_MODE_NIGHT_MASK));
        // 延迟到下帧覆盖系统 edge-to-edge 自动检测，所有模式都重新确保
        getWindow().getDecorView().postDelayed(() -> {
            boolean isDark = resolveIsDark(currentThemeMode);
            applyStatusBarAppearance(isDark);
            Log.d(TAG, "    ★ onConfigChanged reapplied: mode=" + currentThemeMode + " isDark=" + isDark);
        }, 100);
    }

    /**
     * 确保状态栏透明（API < 35 需要手动设置；API 35+ edge-to-edge 系统默认透明）
     */
    private void ensureTransparentStatusBar() {
        Window window = getWindow();
        if (Build.VERSION.SDK_INT < 35) {
            window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            window.setStatusBarColor(Color.TRANSPARENT);
            int uiOptions = window.getDecorView().getSystemUiVisibility();
            uiOptions |= View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN;
            window.getDecorView().setSystemUiVisibility(uiOptions);
        }
    }

    /**
     * 设置状态栏图标颜色（双 API 确保 API 36 edge-to-edge 兼容）
     */
    private void applyStatusBarAppearance(boolean isDark) {
        Window window = getWindow();
        View decorView = window.getDecorView();

        WindowInsetsControllerCompat compatController =
            WindowCompat.getInsetsController(window, decorView);
        compatController.setAppearanceLightStatusBars(!isDark);

        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController nativeController = window.getInsetsController();
            if (nativeController != null) {
                int appearance = isDark ? 0 : WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS;
                nativeController.setSystemBarsAppearance(
                    appearance,
                    WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                );
            }
        }

        Log.d(TAG, "    ★ applyStatusBarAppearance: isDark=" + isDark + " lightStatusBars=" + !isDark);
    }

    /**
     * 解析模式字符串 → 是否为深色主题
     */
    private boolean resolveIsDark(String mode) {
        if ("system".equals(mode)) {
            int nightMode = getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
            return nightMode == Configuration.UI_MODE_NIGHT_YES;
        }
        return "dark".equals(mode);
    }

    /**
     * 从 localStorage 读取主题并应用到状态栏图标颜色
     */
    private void applyThemeFromStorage(WebView webView) {
        Log.d(TAG, "    applyThemeFromStorage: evaluating JS to read localStorage");
        webView.evaluateJavascript(
            "(function() { return localStorage.getItem('theme') || 'system'; })()",
            value -> {
                Log.d(TAG, "    localStorage theme value: " + value);
                String mode = value != null ? value.replace("\"", "") : "system";
                setAppThemeMode(mode);
            }
        );
    }

    /**
     * JS 接口：设置状态栏透明 + 根据主题模式设置图标颜色
     */
    @JavascriptInterface
    public void setAppThemeMode(String mode) {
        if (mode == null || !("light".equals(mode) || "dark".equals(mode) || "system".equals(mode))) {
            mode = "system";
        }
        Log.d(TAG, "    ★ setAppThemeMode: " + mode);
        currentThemeMode = mode;
        final String finalMode = mode;
        runOnUiThread(() -> {
            try {
                ensureTransparentStatusBar();
                boolean isDark = resolveIsDark(finalMode);
                applyStatusBarAppearance(isDark);
                Log.d(TAG, "    ★ setAppThemeMode done: mode=" + finalMode + " isDark=" + isDark);
                getWindow().getDecorView().postDelayed(() -> {
                    applyStatusBarAppearance(isDark);
                    Log.d(TAG, "    ★ setAppThemeMode reapply: isDark=" + isDark);
                }, 200);
            } catch (Exception e) {
                Log.e(TAG, "    ★ setAppThemeMode ERROR", e);
            }
        });
    }

    /**
     * JS 接口：使用 Capacitor Bridge 原生方法重新加载 WebView
     */
    @JavascriptInterface
    public void reloadApp() {
        Log.d(TAG, "    ★ reloadApp called from JS");
        runOnUiThread(() -> {
            try {
                Log.d(TAG, "    ★ calling bridge.reload(), appUrl=" + getBridge().getAppUrl());
                getBridge().getWebView().loadUrl(getBridge().getAppUrl());
            } catch (Exception e) {
                Log.e(TAG, "    ★ reloadApp ERROR", e);
                e.printStackTrace();
            }
        });
    }

    /**
     * JS 接口：设置 DecorView 背景色
     */
    @JavascriptInterface
    public void setWindowBackgroundColor(String hexColor) {
        Log.d(TAG, "    setWindowBackgroundColor: " + hexColor);
        runOnUiThread(() -> {
            try {
                getWindow().getDecorView().setBackgroundColor(Color.parseColor(hexColor));
            } catch (Exception e) {
                e.printStackTrace();
            }
        });
    }
}
