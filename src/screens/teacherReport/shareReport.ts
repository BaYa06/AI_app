/**
 * «Отправить ссылкой» и «PDF» на экране отчёта (plan/new/teacher_cabinet.md, Teacher 55).
 * Ссылка — системное «Поделиться» (на вебе — буфер обмена). PDF — как «Оценки в Excel»
 * (Teacher 22): iOS — файл во временную папку и «Поделиться», веб — скачивание; Android: Share
 * в RN не умеет отдавать файл — делимся ссылкой на отчёт (решение 5 этапа 4).
 */
import { Platform, Share } from 'react-native';
import { NeonService } from '@/services/NeonService';
import { reportShareText, type ReportParams, type TeacherReport } from '@/services/teacherReport';
import { log } from '@/utils/logger';

export type ShareResult = 'shared' | 'copied' | 'failed';

export async function shareReportLink(
  params: ReportParams,
  report: TeacherReport
): Promise<ShareResult> {
  try {
    const link = await NeonService.createReportLink(params);
    if (!link) return 'failed';
    const message = reportShareText(report, link.url);
    if (Platform.OS === 'web') {
      await navigator.clipboard.writeText(link.url);
      return 'copied';
    }
    await Share.share({ message });
    return 'shared';
  } catch (e) {
    log.warn('Report', 'share link failed', e);
    return 'failed';
  }
}

function downloadOnWeb(filename: string, base64: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function shareReportPdf(
  params: ReportParams,
  report: TeacherReport
): Promise<ShareResult> {
  if (Platform.OS === 'android') return shareReportLink(params, report);
  try {
    const file = await NeonService.loadReportPdf(params);
    if (!file) return 'failed';
    if (Platform.OS === 'web') {
      downloadOnWeb(file.filename, file.base64);
      return 'shared';
    }
    const fsModule = require('react-native-fs');
    const RNFS = fsModule?.default ?? fsModule;
    const path = `${RNFS.CachesDirectoryPath}/${file.filename}`;
    await RNFS.writeFile(path, file.base64, 'base64');
    await Share.share({ url: `file://${path}`, title: file.filename });
    return 'shared';
  } catch (e) {
    log.warn('Report', 'pdf failed', e);
    return 'failed';
  }
}
