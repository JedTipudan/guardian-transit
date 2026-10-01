import type { DriverProfile, ParentProfile, StudentProfile, User } from '@prisma/client';

export type SafeUser = Pick<
  User,
  'id' | 'role' | 'status' | 'firstName' | 'lastName' | 'email' | 'phone' | 'avatarUrl' | 'createdAt'
> & {
  studentProfile: StudentProfile | null;
  parentProfile: ParentProfile | null;
  driverProfile:
    | (DriverProfile & { vehicles: { id: string; status: string; plateNumber: string }[] })
    | null;
  fullName: string;
};

type UserWithRelations = User & {
  studentProfile: StudentProfile | null;
  parentProfile: ParentProfile | null;
  driverProfile:
    | (DriverProfile & {
        vehicles: { id: string; status: string; plateNumber: string }[];
        verifications?: { id: string; docType: string; status: string }[];
      })
    | null;
};

export function toSafeUser(user: UserWithRelations): SafeUser {
  const { passwordHash: _passwordHash, ...rest } = user;
  return {
    ...rest,
    fullName: `${user.firstName} ${user.lastName}`.trim(),
  } as SafeUser;
}

export interface ApiOk<T> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: { code: string; message: string; details?: unknown };
}
