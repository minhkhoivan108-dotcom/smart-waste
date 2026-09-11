export type WasteCategory = 'organic' | 'recyclable' | 'inorganic';

export interface WasteClassificationResult {
  category: WasteCategory;
  itemName: string;
  points: number; // 1 for organic, 2 for recyclable, 3 for inorganic
  confidence: number;
  description: string;
  binColor: 'green' | 'yellow' | 'orange';
  recyclingTip: string;
  ecoImpact?: string;
  rawImage?: string;
  isDuplicate?: boolean;
  duplicateSimilarity?: number;
  isScreenOrPhotoSpoof?: boolean;
  spoofReason?: string;
  fingerprintHash?: string;
}

export interface DuplicateAlertInfo {
  itemName: string;
  similarity: number; // 0.0 - 1.0 (e.g. 0.96 = 96%)
  timeSinceLastScanMs: number;
  reason: string;
  suggestedAction: string;
  matchedRecord?: {
    id: string;
    itemName: string;
    timestamp: number;
    thumbnail?: string;
    userName?: string;
    fingerprintHash?: string;
  };
  currentThumbnail?: string;
  isExactFileMatch?: boolean;
  isScreenSpoof?: boolean;
}

export interface ScannedFingerprintRecord {
  id: string;
  dHash: string; // 64-bit difference hash
  aHash: string; // 64-bit average hash
  checksum: string; // content byte signature
  timestamp: number;
  itemName: string;
  category: WasteCategory;
  points: number;
  userName?: string;
  thumbnail?: string;
}


export interface WasteHistoryRecord extends WasteClassificationResult {
  id: string;
  timestamp: number;
  userName: string;
}

export interface UserProfile {
  id: string;
  name: string;
  organization: string; // Lớp, Chi đội STEM, hoặc Trường
  avatar: string;
  totalPoints: number;
  organicCount: number;
  recyclableCount: number;
  inorganicCount: number;
  createdAt: number;
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  organization: string;
  totalPoints: number;
  avatar: string;
  levelTitle: string;
  lastActive: number;
  isCurrentUser?: boolean;
}

export interface DemoWasteItem {
  id: string;
  category: WasteCategory;
  itemName: string;
  points: number;
  confidence: number;
  description: string;
  binColor: 'green' | 'yellow' | 'orange';
  recyclingTip: string;
  ecoImpact: string;
  emoji: string;
  imageUrl?: string;
}
