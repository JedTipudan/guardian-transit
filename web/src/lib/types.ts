/** Shared API response shapes (mirrors the Express serializers). */

export type Role = 'STUDENT' | 'PARENT' | 'DRIVER' | 'ADMIN';

export type RideStatus =
  | 'REQUESTED'
  | 'DRIVER_ASSIGNED'
  | 'DRIVER_ARRIVED'
  | 'PIN_VERIFIED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

export type VerificationStatus =
  | 'PENDING'
  | 'UNDER_REVIEW'
  | 'VERIFIED'
  | 'REQUIRES_ACTION'
  | 'REJECTED';

export interface StudentProfile {
  id: string;
  studentCode: string;
  school: string;
  grade: string;
  homeAddress?: string | null;
}

export interface ParentProfile {
  id: string;
  address?: string | null;
  preferredContact?: string | null;
}

export interface DriverVehicleSummary {
  id: string;
  status: string;
  plateNumber: string;
}

export interface DriverProfileSummary {
  id: string;
  licenseNumber?: string | null;
  vehicles?: DriverVehicleSummary[];
  verifications?: { id: string; docType: string; status: string }[];
}

export interface User {
  id: string;
  role: Role;
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string;
  avatarUrl: string | null;
  createdAt: string;
  fullName: string;
  studentProfile: StudentProfile | null;
  parentProfile: ParentProfile | null;
  driverProfile: DriverProfileSummary | null;
}

export interface RidePerson {
  id: string;
  name: string;
  avatarUrl?: string | null;
  phone?: string;
  rating?: number;
  totalTrips?: number;
  overallStatus?: string;
}

export interface RidePoint {
  label: string;
  address: string;
  lat: number;
  lng: number;
}

export interface RideEvent {
  id: string;
  type: string;
  message: string;
  createdAt: string;
}

export interface SerializedRide {
  id: string;
  code: string;
  status: RideStatus;
  student: {
    id: string;
    studentCode: string;
    name: string;
    avatarUrl: string | null;
    phone: string;
    school: string;
    grade: string;
  };
  parent: { id: string; name: string; phone: string } | null;
  driver: RidePerson;
  vehicle: {
    id: string;
    nickname: string;
    make: string;
    model: string;
    color: string;
    plateNumber: string;
    status: string;
  };
  pickup: RidePoint;
  destination: RidePoint;
  fare: number;
  distanceKm: number;
  durationMin: number;
  rating: number | null;
  reviewNote: string | null;
  cancelReason: string | null;
  cancelRequestedBy: string | null;
  pinFailedAttempts: number;
  pinLockedUntil: string | null;
  pinVerified: boolean;
  pin?: string;
  freeRideApplied: boolean;
  timeline: RideEvent[];
  requestedAt: string;
  acceptedAt: string | null;
  arrivedAt: string | null;
  verifiedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
}

export interface AvailableDriver {
  id: string;
  name: string;
  avatarUrl: string | null;
  rating: number;
  completedTrips: number;
  totalTrips: number;
  verifiedAt: string | null;
  locationKnown: boolean;
  distanceKm: number | null;
  etaMinutes: number | null;
  vehicle: {
    id: string;
    nickname: string;
    make: string;
    model: string;
    color: string;
    plateNumber: string;
  } | null;
}

export interface SavedLocation {
  id: string;
  kind: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
}

export interface GeocodeResult {
  id: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
  source: 'saved' | 'places' | 'geocoder';
}

export interface Quote {
  distanceKm: number;
  durationMin: number;
  fare: number;
  currency: string;
  baseFare: number;
  perKm: number;
  minimumFare: number;
}

export interface StudentListItem {
  id: string;
  connectionId: string | null;
  name: string;
  avatarUrl: string | null;
  studentCode: string;
  school: string;
  grade: string;
  activeRide: { id: string; code: string; status: RideStatus } | null;
  points: number;
}

export interface GuardianConnection {
  id: string;
  status: 'PENDING' | 'ACTIVE' | 'DECLINED' | 'REVOKED';
  createdAt: string;
  note: string | null;
  student: {
    id: string;
    studentCode: string;
    name: string;
    avatarUrl: string | null;
    school: string;
    grade: string;
  };
  points: number;
  completedRides: number;
  activeRide: SerializedRide | null;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
  rideId?: string | null;
}

export interface RewardsPayload {
  student: { id: string; studentCode: string; name: string };
  balance: number;
  perRide: number;
  goal: number;
  progress: number;
  remaining: number;
  percent: number;
  completedRides: number;
  freeRidesClaimed: number;
  freeRidesAvailable: number;
  rewards: RewardItem[];
  ledger: LedgerEntry[];
}

export interface RewardItem {
  id: string;
  status: string;
  value: string | number;
  batchKey?: string | null;
  issuedAt?: string;
  redeemedAt?: string | null;
  freeRideForRideId?: string | null;
}

export interface LedgerEntry {
  id: string;
  delta: number;
  reason: string;
  balanceAfter: number;
  note: string | null;
  createdAt: string;
  rideId?: string | null;
}

export interface SafetyCategory {
  value: string;
  label: string;
  hint: string;
}

export interface SafetyReport {
  id: string;
  category: string;
  subject: string;
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'NEW' | 'UNDER_REVIEW' | 'RESOLVED';
  resolution?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
  ride?: { id: string; code: string; status?: string; requestedAt?: string } | null;
  reporter?: { id: string; firstName: string; lastName: string; role: string };
}

export interface Hotline {
  key: string;
  label: string;
  number: string;
  description?: string | null;
  available24h?: boolean;
}

export interface EmergencyEvent {
  id: string;
  type: string;
  message: string | null;
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED' | 'FALSE_ALARM';
  lat: number | null;
  lng: number | null;
  hotlineNumber: string | null;
  hotlineLabel: string | null;
  guardianContact: string | null;
  sharedWithGuardian: boolean;
  resolutionNote?: string | null;
  createdAt: string;
  acknowledgedAt?: string | null;
  resolvedAt?: string | null;
  ride?: { id: string; code: string; status: string } | null;
  raisedBy?: { id: string; firstName: string; lastName: string; role: string; phone?: string };
  handledBy?: { id: string; firstName: string; lastName: string } | null;
}

export interface DriverMe {
  driver: {
    id: string;
    name: string;
    phone: string;
    avatarUrl: string | null;
    isOnline: boolean;
    rating: number;
    totalTrips: number;
    completedTrips: number;
    overallStatus: VerificationStatus;
    backgroundCheckStatus: string;
    verifiedAt: string | null;
    licenseNumber: string;
    licenseExpiry: string;
    lastLocationAt: string | null;
  };
  vehicles: {
    id: string;
    nickname: string;
    make: string;
    model: string;
    color: string;
    plateNumber: string;
    capacity: number;
    status: VerificationStatus;
    isActive: boolean;
  }[];
  verifications: {
    id: string;
    docType: string;
    status: VerificationStatus;
    notes: string | null;
    submittedAt: string;
    reviewedAt: string | null;
  }[];
  stats: {
    todayTrips: number;
    pendingRequests: number;
    todayEarnings: number;
    activeRide: SerializedRide | null;
  };
}

export interface AdminStats {
  totals: {
    users: number;
    pendingVerifications: number;
    activeRides: number;
    completedToday: number;
    openEmergencies: number;
    newReports: number;
    onlineDrivers: number;
    ridesToday: number;
  };
}

export interface AdminVerificationDriver {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  joinedAt: string;
  licenseNumber: string;
  licenseExpiry: string;
  overallStatus: VerificationStatus;
  backgroundCheckStatus: string;
  verifiedAt: string | null;
  checks: {
    id: string;
    docType: string;
    status: VerificationStatus;
    reference: string | null;
    notes: string | null;
    submittedAt: string;
    reviewedAt: string | null;
  }[];
  vehicles: {
    id: string;
    label: string;
    plateNumber: string;
    status: VerificationStatus;
    verifications: {
      id: string;
      docType: string;
      status: VerificationStatus;
      notes: string | null;
      reviewedAt: string | null;
    }[];
  }[];
}

export interface AdminUser {
  id: string;
  role: Role;
  status: string;
  name: string;
  phone: string;
  email: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  verification: VerificationStatus | null;
  studentCode: string | null;
  vehicleCount: number;
}

export interface PublicConfig {
  hotlines: Hotline[];
  sosMessage?: string;
  supportEmail?: string;
}

export interface MetaPayload {
  maps: {
    provider: string;
    tileUrl: string | null;
    attribution: string | null;
    hasApiKey: boolean;
  };
  otp: {
    ttlSeconds: number;
    length: number;
    maxAttempts: number;
    resendCooldownSeconds: number;
  };
  smsProvider: string;
  hotlines: Hotline[];
  sosMessage?: string;
  supportEmail?: string;
}
