import { WasteReport, WasteReportSubmissionPayload, ReportProcessingStatus } from '../types';

/**
 * Fetch all verified public waste reports
 */
export async function fetchWasteReports(status?: string): Promise<WasteReport[]> {
  try {
    const url = status && status !== 'all' 
      ? `/api/waste-reports?status=${encodeURIComponent(status)}`
      : '/api/waste-reports';

    const res = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
    if (!res.ok) {
      console.warn('Notice fetching waste reports:', res.status);
      return [];
    }
    const data = await res.json();
    return Array.isArray(data.reports) ? data.reports : [];
  } catch (err) {
    console.warn('Network error fetching waste reports:', err);
    return [];
  }
}

export interface SubmitReportResult {
  success: boolean;
  approved: boolean;
  report?: WasteReport;
  rejectionReason?: string;
  message?: string;
  error?: string;
}

/**
 * Submit a citizen waste report for AI moderation & publishing
 */
export async function submitWasteReport(
  payload: WasteReportSubmissionPayload
): Promise<SubmitReportResult> {
  try {
    const res = await fetch('/api/waste-reports/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (res.status === 422 || data.approved === false) {
      // Rejection by moderation
      return {
        success: false,
        approved: false,
        rejectionReason: data.rejectionReason || 'Hình ảnh hoặc nội dung không đạt tiêu chuẩn kiểm duyệt.',
      };
    }

    if (!res.ok) {
      return {
        success: false,
        approved: false,
        error: data.error || `HTTP ${res.status}: Gửi phản ánh thất bại`,
      };
    }

    return {
      success: true,
      approved: true,
      report: data.report,
      message: data.message || 'Bài phản ánh đã được phê duyệt và hiển thị công khai!',
    };
  } catch (err: any) {
    return {
      success: false,
      approved: false,
      error: err.message || 'Lỗi kết nối mạng đến máy chủ kiểm duyệt AI',
    };
  }
}

/**
 * Upvote / endorse a community report
 */
export async function upvoteReport(reportId: string): Promise<WasteReport | null> {
  try {
    const res = await fetch(`/api/waste-reports/${encodeURIComponent(reportId)}/upvote`, {
      method: 'POST',
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.report || null;
  } catch (err) {
    console.warn('Notice upvoting report:', err);
    return null;
  }
}

/**
 * Update report status (e.g. mark as investigating or resolved)
 */
export async function updateReportStatus(
  reportId: string,
  status: ReportProcessingStatus,
  resolutionNote?: string
): Promise<WasteReport | null> {
  try {
    const res = await fetch(`/api/waste-reports/${encodeURIComponent(reportId)}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, resolutionNote }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.report || null;
  } catch (err) {
    console.warn('Notice updating report status:', err);
    return null;
  }
}

/**
 * Delete a waste report
 */
export async function deleteReportApi(reportId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/waste-reports/${encodeURIComponent(reportId)}`, {
      method: 'DELETE',
    });
    return res.ok;
  } catch (err) {
    console.warn('Notice deleting report:', err);
    return false;
  }
}

/**
 * Clear all waste reports (reset to empty real state)
 */
export async function clearAllReportsApi(): Promise<boolean> {
  try {
    const res = await fetch('/api/waste-reports/clear-all', {
      method: 'POST',
    });
    return res.ok;
  } catch (err) {
    console.warn('Notice clearing all reports:', err);
    return false;
  }
}
