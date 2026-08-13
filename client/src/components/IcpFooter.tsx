/**
 * ============================================================
 * 备案信息与 APP 下载按钮 (IcpFooter)
 * ============================================================
 * 首页底部备案链接与 Web 端下载按钮（从 HomePage 抽出）
 */

import { ArrowDown } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import styles from './IcpFooter.module.css';

interface IcpFooterProps {
  showDownloadBtn: boolean;
}

export default function IcpFooter({ showDownloadBtn }: IcpFooterProps) {
  return (
    <>
      <div
        className={styles.icp}
        onClick={() => window.open('https://beian.miit.gov.cn', '_blank')}
        title="工业和信息化部ICP/IP地址/域名信息备案管理系统"
      >
        湘ICP备2026022321号
      </div>
      <a
        className={styles.icpItem}
        target="_blank"
        href="http://www.beian.gov.cn/portal/registerSystemInfo?recordcode=43042602000239"
        title="湖南省公安厅网络安全保卫总队"
      >
        <img
          src="/icp-icon.png"
          className={styles.policeIcon}
          alt="公安备案"
        />
        <span>湘公网安备43042602000239号</span>
      </a>

      {/* Web端 APP 下载按钮 */}
      {!Capacitor.isNativePlatform() && (
        <a
          className={`${styles.downloadBtn}${showDownloadBtn ? '' : ` ${styles.downloadBtnHidden}`}`}
          href="/uploads/shuangchenyue.apk"
          download
          title="下载APP"
        >
          <ArrowDown size={18} className={styles.downloadIconDesktop} />
          <ArrowDown size={20} className={styles.downloadIconMobile} />
          <span className={styles.downloadText}>APP</span>
        </a>
      )}
    </>
  );
}
