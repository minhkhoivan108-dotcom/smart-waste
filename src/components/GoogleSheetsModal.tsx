import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  Check,
  Copy,
  ExternalLink,
  X,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  AlertCircle,
  HelpCircle,
  Code,
  Link,
  Laptop
} from 'lucide-react';
import {
  getGoogleSheetsUrl,
  setGoogleSheetsUrl,
  testGoogleSheetsConnection,
} from '../lib/googleSheets';
import { playClickSound, playVictorySound } from '../utils/audio';

interface GoogleSheetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnectionSuccess?: () => void;
}

export const GOOGLE_APPS_SCRIPT_CODE = `/**
 * ==============================================================================
 * ECOSORT AI - GOOGLE APPS SCRIPT CHO CUỘC THI STEM MÔI TRƯỜNG
 * ==============================================================================
 * 
 * Hướng dẫn thiết lập nhanh:
 * 1. Mở Google Sheets mới tại: https://sheets.new
 * 2. Menu: Tiện ích mở rộng (Extensions) > Apps Script
 * 3. Dán toàn bộ mã này vào Code.gs và bấm Lưu (Ctrl+S).
 * 4. Bấm "Triển khai" (Deploy) > "Tùy chọn triển khai mới" (New deployment).
 * 5. Chọn loại: "Ứng dụng web" (Web app)
 *    - Thực thi dưới dạng: "Tôi" (Me)
 *    - Ai có quyền truy cập: "Bất kỳ ai" (Anyone) -> QUAN TRỌNG ĐỂ CÁC MÁY KHÁC ĐỀU KẾT NỐI ĐƯỢC!
 * 6. Bấm Triển khai, Cấp quyền và sao chép Web App URL dán vào EcoSort.
 */

function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var playersSheet = getOrCreateSheet(ss, "Bảng Xếp Hạng", [
      "ID", "Tên Người Chơi", "Đơn Vị / Lớp", "Avatar", "Tổng Điểm", "Số Lần Đúng", "Hữu Cơ", "Tái Chế", "Vô Cơ", "Cập Nhật Lần Cuối"
    ]);
    var historySheet = getOrCreateSheet(ss, "Lịch Sử Phân Loại", [
      "ID Lần Quét", "Thời Gian", "Tên Người Chơi", "Tên Món Rác", "Loại Rác", "Điểm Cộng", "Nguồn Quét", "Độ Tin Cậy"
    ]);

    var players = getPlayersData(playersSheet);
    var logs = getHistoryData(historySheet);

    var response = {
      status: "success",
      timestamp: new Date().toISOString(),
      sheetTitle: ss.getName(),
      totalPlayers: players.length,
      totalScans: logs.length,
      players: players,
      history: logs
    };

    return ContentService.createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var playersSheet = getOrCreateSheet(ss, "Bảng Xếp Hạng", [
      "ID", "Tên Người Chơi", "Đơn Vị / Lớp", "Avatar", "Tổng Điểm", "Số Lần Đúng", "Hữu Cơ", "Tái Chế", "Vô Cơ", "Cập Nhật Lần Cuối"
    ]);
    var historySheet = getOrCreateSheet(ss, "Lịch Sử Phân Loại", [
      "ID Lần Quét", "Thời Gian", "Tên Người Chơi", "Tên Món Rác", "Loại Rác", "Điểm Cộng", "Nguồn Quét", "Độ Tin Cậy"
    ]);

    var payload = {};
    if (e.postData && e.postData.contents) {
      try {
        payload = JSON.parse(e.postData.contents);
      } catch (ex) {
        payload = e.parameter || {};
      }
    } else {
      payload = e.parameter || {};
    }

    var action = payload.action || "recordWaste";

    if (action === "recordWaste") {
      var playerName = (payload.playerName || "Thí sinh STEM").trim();
      var organization = (payload.organization || "Khối Sáng Tạo STEM").trim();
      var avatar = payload.avatar || "🌱";
      var itemName = payload.itemName || "Vật thể rác";
      var category = (payload.category || "organic").toLowerCase();
      var source = payload.source || "webcam";
      var confidence = payload.confidence || 0.95;

      // QUY TẮC ĐIỂM STEM:
      // Rác hữu cơ → +1 điểm
      // Rác tái chế → +2 điểm
      // Rác vô cơ → +3 điểm
      var points = 1;
      if (category === "organic") {
        points = 1;
      } else if (category === "recyclable") {
        points = 2;
      } else if (category === "inorganic") {
        points = 3;
      }

      var userResult = updatePlayerScore(playersSheet, playerName, organization, avatar, points, category);

      var now = new Date();
      var timeStr = Utilities.formatDate(now, Session.getScriptTimeZone() || "GMT+7", "yyyy-MM-dd HH:mm:ss");
      var logId = "scan_" + now.getTime();
      
      historySheet.appendRow([
        logId,
        timeStr,
        playerName,
        itemName,
        category,
        points,
        source,
        (Math.round(confidence * 100)) + "%"
      ]);

      sortLeaderboard(playersSheet);
      var updatedLeaderboard = getPlayersData(playersSheet);

      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        action: "recordWaste",
        awardedPoints: points,
        player: userResult,
        leaderboard: updatedLeaderboard
      })).setMimeType(ContentService.MimeType.JSON);
    } else if (action === "registerPlayer") {
      var pName = (payload.playerName || "Thí sinh mới").trim();
      var pOrg = (payload.organization || "Khối Sáng Tạo STEM").trim();
      var pAvatar = payload.avatar || "🌱";

      var regResult = registerNewPlayer(playersSheet, pName, pOrg, pAvatar);
      sortLeaderboard(playersSheet);
      var currentLeaderboard = getPlayersData(playersSheet);

      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        action: "registerPlayer",
        player: regResult,
        leaderboard: currentLeaderboard
      })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: "Unknown action: " + action
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function getOrCreateSheet(ss, sheetName, headers) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground("#0f172a");
    headerRange.setFontColor("#38bdf8");
    headerRange.setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getPlayersData(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  var players = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[1] || row[1].toString().trim() === "") continue;

    players.push({
      id: row[0] ? row[0].toString() : "p_" + i,
      name: row[1].toString(),
      organization: row[2] ? row[2].toString() : "Khối Sáng Tạo STEM",
      avatar: row[3] ? row[3].toString() : "🌱",
      totalPoints: Number(row[4]) || 0,
      correctCount: Number(row[5]) || 0,
      organicCount: Number(row[6]) || 0,
      recyclableCount: Number(row[7]) || 0,
      inorganicCount: Number(row[8]) || 0,
      lastActive: row[9] ? new Date(row[9]).getTime() : Date.now()
    });
  }

  players.sort(function(a, b) {
    if (b.totalPoints !== a.totalPoints) {
      return b.totalPoints - a.totalPoints;
    }
    return b.correctCount - a.correctCount;
  });

  return players;
}

function getHistoryData(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  var logs = [];
  var startIndex = Math.max(1, data.length - 100);
  for (var i = data.length - 1; i >= startIndex; i--) {
    var row = data[i];
    if (!row[0] && !row[1]) continue;

    logs.push({
      id: row[0] ? row[0].toString() : "scan_" + i,
      timestamp: row[1] ? new Date(row[1]).getTime() : Date.now(),
      userName: row[2] ? row[2].toString() : "Thí sinh",
      itemName: row[3] ? row[3].toString() : "Rác phân loại",
      category: row[4] ? row[4].toString() : "organic",
      points: Number(row[5]) || 1,
      source: row[6] ? row[6].toString() : "webcam",
      confidence: row[7] ? parseFloat(row[7].toString().replace("%", "")) / 100 : 0.95
    });
  }
  return logs;
}

function updatePlayerScore(sheet, playerName, organization, avatar, pointsToAdd, category) {
  var data = sheet.getDataRange().getValues();
  var rowIndex = -1;

  for (var i = 1; i < data.length; i++) {
    if (data[i][1] && data[i][1].toString().trim().toLowerCase() === playerName.toLowerCase()) {
      rowIndex = i + 1;
      break;
    }
  }

  var now = new Date();
  var timeStr = Utilities.formatDate(now, Session.getScriptTimeZone() || "GMT+7", "yyyy-MM-dd HH:mm:ss");

  if (rowIndex > 0) {
    var currentPoints = Number(sheet.getRange(rowIndex, 5).getValue()) || 0;
    var currentCorrect = Number(sheet.getRange(rowIndex, 6).getValue()) || 0;
    var currentOrganic = Number(sheet.getRange(rowIndex, 7).getValue()) || 0;
    var currentRecyclable = Number(sheet.getRange(rowIndex, 8).getValue()) || 0;
    var currentInorganic = Number(sheet.getRange(rowIndex, 9).getValue()) || 0;

    var newPoints = currentPoints + pointsToAdd;
    var newCorrect = currentCorrect + 1;
    var newOrg = currentOrganic + (category === "organic" ? 1 : 0);
    var newRec = currentRecyclable + (category === "recyclable" ? 1 : 0);
    var newInorg = currentInorganic + (category === "inorganic" ? 1 : 0);

    sheet.getRange(rowIndex, 3).setValue(organization);
    sheet.getRange(rowIndex, 4).setValue(avatar);
    sheet.getRange(rowIndex, 5).setValue(newPoints);
    sheet.getRange(rowIndex, 6).setValue(newCorrect);
    sheet.getRange(rowIndex, 7).setValue(newOrg);
    sheet.getRange(rowIndex, 8).setValue(newRec);
    sheet.getRange(rowIndex, 9).setValue(newInorg);
    sheet.getRange(rowIndex, 10).setValue(timeStr);

    return {
      name: playerName,
      organization: organization,
      avatar: avatar,
      totalPoints: newPoints,
      correctCount: newCorrect,
      organicCount: newOrg,
      recyclableCount: newRec,
      inorganicCount: newInorg,
      lastActive: now.getTime()
    };
  } else {
    var newId = "p_" + now.getTime();
    var orgCount = category === "organic" ? 1 : 0;
    var recCount = category === "recyclable" ? 1 : 0;
    var inorgCount = category === "inorganic" ? 1 : 0;

    sheet.appendRow([
      newId,
      playerName,
      organization,
      avatar,
      pointsToAdd,
      1,
      orgCount,
      recCount,
      inorgCount,
      timeStr
    ]);

    return {
      id: newId,
      name: playerName,
      organization: organization,
      avatar: avatar,
      totalPoints: pointsToAdd,
      correctCount: 1,
      organicCount: orgCount,
      recyclableCount: recCount,
      inorganicCount: inorgCount,
      lastActive: now.getTime()
    };
  }
}

function registerNewPlayer(sheet, playerName, organization, avatar) {
  var data = sheet.getDataRange().getValues();
  var rowIndex = -1;

  for (var i = 1; i < data.length; i++) {
    if (data[i][1] && data[i][1].toString().trim().toLowerCase() === playerName.toLowerCase()) {
      rowIndex = i + 1;
      break;
    }
  }

  var now = new Date();
  var timeStr = Utilities.formatDate(now, Session.getScriptTimeZone() || "GMT+7", "yyyy-MM-dd HH:mm:ss");

  if (rowIndex > 0) {
    sheet.getRange(rowIndex, 3).setValue(organization);
    sheet.getRange(rowIndex, 4).setValue(avatar);
    sheet.getRange(rowIndex, 10).setValue(timeStr);

    return {
      id: sheet.getRange(rowIndex, 1).getValue().toString(),
      name: playerName,
      organization: organization,
      avatar: avatar,
      totalPoints: Number(sheet.getRange(rowIndex, 5).getValue()) || 0,
      correctCount: Number(sheet.getRange(rowIndex, 6).getValue()) || 0
    };
  } else {
    var newId = "p_" + now.getTime();
    sheet.appendRow([
      newId,
      playerName,
      organization,
      avatar,
      0, // Khởi tạo 0 điểm
      0, // 0 lần đúng
      0, 0, 0,
      timeStr
    ]);

    return {
      id: newId,
      name: playerName,
      organization: organization,
      avatar: avatar,
      totalPoints: 0,
      correctCount: 0,
      organicCount: 0,
      recyclableCount: 0,
      inorganicCount: 0
    };
  }
}

function sortLeaderboard(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow > 2) {
    var range = sheet.getRange(2, 1, lastRow - 1, 10);
    range.sort([
      { column: 5, ascending: false },
      { column: 6, ascending: false }
    ]);
  }
}
`;

export const GoogleSheetsModal: React.FC<GoogleSheetsModalProps> = ({
  isOpen,
  onClose,
  onConnectionSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<'connect' | 'guide' | 'code'>('connect');
  const [scriptUrl, setScriptUrl] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    sheetTitle?: string;
    totalPlayers?: number;
  } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setScriptUrl(getGoogleSheetsUrl());
      setTestResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTestAndSave = async () => {
    playClickSound();
    setIsTesting(true);
    setTestResult(null);

    const cleanUrl = scriptUrl.trim();
    const result = await testGoogleSheetsConnection(cleanUrl);

    setIsTesting(false);
    setTestResult(result);

    if (result.success) {
      setGoogleSheetsUrl(cleanUrl);
      // Also notify backend proxy
      try {
        await fetch('/api/sheets/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: cleanUrl }),
        });
      } catch {
        // ignore
      }

      playVictorySound();
      if (onConnectionSuccess) {
        onConnectionSuccess();
      }
    }
  };

  const handleCopyCode = () => {
    playClickSound();
    navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_CODE);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const isConfigured = Boolean(scriptUrl && scriptUrl.startsWith('https://script.google.com/'));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div
        id="google-sheets-modal"
        className="relative w-full max-w-3xl bg-slate-900 border-2 border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/20 border-2 border-emerald-500/40 text-emerald-400">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-100 tracking-tight">
                  Kết Nối Google Sheets Online
                </h3>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    isConfigured
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  }`}
                >
                  {isConfigured ? '🟢 Đã gắn Web App' : 'Chưa thiết lập'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Lưu tên người chơi, điểm số hiện tại và lịch sử quét rác trực tiếp lên Google Sheets cho nhiều thiết bị
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              playClickSound();
              onClose();
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 px-4 pt-2 gap-2">
          <button
            type="button"
            onClick={() => {
              playClickSound();
              setActiveTab('connect');
            }}
            className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'connect'
                ? 'border-emerald-400 text-emerald-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Link className="w-3.5 h-3.5" />
            <span>Cấu Hình & Kiểm Tra</span>
          </button>

          <button
            type="button"
            onClick={() => {
              playClickSound();
              setActiveTab('guide');
            }}
            className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'guide'
                ? 'border-emerald-400 text-emerald-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Hướng Dẫn 6 Bước (Dễ Nhất)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              playClickSound();
              setActiveTab('code');
            }}
            className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'code'
                ? 'border-emerald-400 text-emerald-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            <span>Mã Nguồn Apps Script (Code.gs)</span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {activeTab === 'connect' && (
            <div className="space-y-4">
              {/* Feature Highlights Card */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                    <Laptop className="w-4 h-4" />
                    <span>Đa Thiết Bị Dùng Chung</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Nhiều học sinh, đội thi dùng điện thoại/laptop khác nhau đều cập nhật chung vào một Google Sheet.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
                    <Sparkles className="w-4 h-4" />
                    <span>Quy Tắc Điểm Chuẩn</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Hữu cơ: <strong className="text-emerald-300">+1đ</strong> &bull; Tái chế: <strong className="text-amber-300">+2đ</strong> &bull; Vô cơ: <strong className="text-orange-300">+3đ</strong>.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-cyan-400">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Tự Động Tạo Cột</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Apps Script tự động tạo 2 sheet: "Bảng Xếp Hạng" và "Lịch Sử Phân Loại" có format đẹp mắt.
                  </p>
                </div>
              </div>

              {/* URL Input Box */}
              <div className="p-4 rounded-2xl bg-slate-950 border-2 border-slate-800 space-y-3">
                <label className="block text-xs font-bold text-slate-200">
                  URL của Google Apps Script Web App (Exec URL):
                </label>
                <div className="relative">
                  <input
                    type="url"
                    value={scriptUrl}
                    onChange={(e) => setScriptUrl(e.target.value)}
                    placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
                  />
                </div>

                <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
                  <a
                    href="https://sheets.new"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 underline font-medium"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Tạo Google Sheet mới tại sheets.new</span>
                  </a>

                  <button
                    type="button"
                    onClick={handleTestAndSave}
                    disabled={isTesting || !scriptUrl.trim()}
                    className="px-4 py-2 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:via-teal-500 hover:to-cyan-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-950/50 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 active:scale-95"
                  >
                    {isTesting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Đang kiểm tra kết nối...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Lưu & Kiểm Tra Kết Nối</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Test Result Alert */}
              {testResult && (
                <div
                  className={`p-3.5 rounded-xl border flex items-start gap-3 text-xs animate-in fade-in ${
                    testResult.success
                      ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-200'
                      : 'bg-rose-950/60 border-rose-500/50 text-rose-200'
                  }`}
                >
                  {testResult.success ? (
                    <Check className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-1">
                    <p className="font-bold">{testResult.message}</p>
                    {testResult.success && testResult.sheetTitle && (
                      <p className="text-[11px] text-emerald-300/90">
                        Đang đồng bộ điểm thực tế với Google Sheets: <strong>{testResult.sheetTitle}</strong>
                        {typeof testResult.totalPlayers === 'number' && (
                          <span> (Đã có {testResult.totalPlayers} thí sinh trên bảng xếp hạng).</span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Notice */}
              <div className="p-3 bg-slate-950/50 rounded-xl border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
                💡 <strong>Lưu ý quan trọng:</strong> Dữ liệu điểm số và lịch sử phân loại rác được đồng bộ trực tiếp lên Google Sheets. Mỗi khi thí sinh quét phân loại rác trên Webcam, hệ thống sẽ gửi điểm mới (+1, +2, +3) và tự động sắp xếp lại bảng xếp hạng theo điểm từ cao xuống thấp.
              </div>
            </div>
          )}

          {activeTab === 'guide' && (
            <div className="space-y-3.5 text-xs text-slate-300">
              <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/30">
                <h4 className="font-bold text-emerald-300 mb-1 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4" />
                  <span>Cách tạo Google Sheets lưu điểm STEM trong 2 phút:</span>
                </h4>
                <p className="text-[11px] text-slate-400">
                  Google Apps Script hoạt động như một Backend API miễn phí, không cần cài đặt server phức tạp, không yêu cầu người dùng khác phải đăng nhập Google.
                </p>
              </div>

              <ol className="space-y-3 list-decimal list-inside">
                <li className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  <strong className="text-slate-100">Bước 1: Tạo Google Sheet mới</strong>
                  <p className="text-[11px] text-slate-400 mt-1 pl-4">
                    Mở trình duyệt và truy cập <a href="https://sheets.new" target="_blank" rel="noreferrer" className="text-cyan-400 underline">sheets.new</a> để tạo một trang tính Google trống. Đặt tên trang tính ví dụ: <em>"Cuộc Thi STEM - Phân Loại Rác Thông Minh"</em>.
                  </p>
                </li>

                <li className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  <strong className="text-slate-100">Bước 2: Mở Apps Script</strong>
                  <p className="text-[11px] text-slate-400 mt-1 pl-4">
                    Trên thanh menu của Google Sheets, chọn <strong>Tiện ích mở rộng (Extensions)</strong> &gt; <strong>Apps Script</strong>.
                  </p>
                </li>

                <li className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  <strong className="text-slate-100">Bước 3: Dán mã nguồn Code.gs</strong>
                  <p className="text-[11px] text-slate-400 mt-1 pl-4">
                    Xóa toàn bộ nội dung mẫu đang có trong file <code>Code.gs</code>. Chuyển sang tab <strong>"Mã Nguồn Apps Script"</strong> ở trên, bấm <em>"Sao chép mã 1-click"</em> và dán vào. Bấm biểu tượng <strong>Lưu (Save / Ctrl+S)</strong>.
                  </p>
                </li>

                <li className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  <strong className="text-slate-100">Bước 4: Triển khai ứng dụng Web (Deploy Web App)</strong>
                  <p className="text-[11px] text-slate-400 mt-1 pl-4">
                    Ở góc trên bên phải màn hình Apps Script, nhấn nút màu xanh <strong>Triển khai (Deploy)</strong> &gt; chọn <strong>Tùy chọn triển khai mới (New deployment)</strong>.
                  </p>
                </li>

                <li className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  <strong className="text-slate-100">Bước 5: Cấu hình quyền truy cập (Rất quan trọng!)</strong>
                  <div className="text-[11px] text-slate-400 mt-1 pl-4 space-y-1">
                    <p>&bull; Nhấn vào biểu tượng bánh răng cạnh "Chọn loại" &gt; Chọn <strong>Ứng dụng web (Web app)</strong>.</p>
                    <p>&bull; <strong>Thực thi dưới dạng (Execute as):</strong> Chọn <em>Tôi (Me - email của bạn)</em>.</p>
                    <p className="text-amber-300 font-semibold">&bull; <strong>Ai có quyền truy cập (Who has access):</strong> BẮT BUỘC CHỌN <em>Bất kỳ ai (Anyone)</em>. (Để học sinh dùng thiết bị khác không cần đăng nhập Google).</p>
                    <p>&bull; Nhấn <strong>Triển khai (Deploy)</strong> &gt; Bấm <strong>Cấp quyền truy cập (Authorize Access)</strong> &gt; Chọn tài khoản Google của bạn &gt; Nhấn <em>Nâng cao (Advanced)</em> &gt; Chọn <em>Đi tới dự án (Go to project)</em> &gt; Nhấn <strong>Cho phép (Allow)</strong>.</p>
                  </div>
                </li>

                <li className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  <strong className="text-slate-100">Bước 6: Dán URL vào EcoSort AI</strong>
                  <p className="text-[11px] text-slate-400 mt-1 pl-4">
                    Sao chép đường link <strong>URL của ứng dụng web (Web app URL)</strong> có đuôi <code>/exec</code>, quay lại website EcoSort AI, dán vào tab <strong>"Cấu Hình & Kiểm Tra"</strong> và bấm <strong>"Lưu & Kiểm Tra Kết Nối"</strong>.
                  </p>
                </li>
              </ol>
            </div>
          )}

          {activeTab === 'code' && (
            <div className="relative flex flex-col bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
              <div className="flex items-center justify-between px-3.5 py-2 bg-slate-900 border-b border-slate-800 text-xs">
                <span className="font-mono text-slate-400">Code.gs (Google Apps Script)</span>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer active:scale-95"
                >
                  {copiedCode ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Đã sao chép!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Sao chép mã 1-click</span>
                    </>
                  )}
                </button>
              </div>

              <pre className="p-4 text-[11px] font-mono text-emerald-300 overflow-x-auto max-h-[380px] leading-relaxed selection:bg-emerald-800 selection:text-white">
                {GOOGLE_APPS_SCRIPT_CODE}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs">
          <span className="text-slate-400 text-[11px]">
            File mã nguồn cũng được lưu tại thư mục gốc: <code className="text-emerald-400 font-mono">/google_apps_script.js</code>
          </span>
          <button
            type="button"
            onClick={() => {
              playClickSound();
              onClose();
            }}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold transition-all cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
