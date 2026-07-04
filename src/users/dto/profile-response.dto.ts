// Profile + user shapes returned by /api/users routes.
import { Profile, User } from '@/generated/prisma';
import { toUserDto, UserDto } from '@/auth/dto/user-response.dto';

export interface ProfileDto {
  skills: string[];
  experienceYears: number;
  currentRole: string | null;
  targetRole: string | null;
  preferredLocation: string | null;
}

export type UserWithProfileDto = UserDto & { profile: ProfileDto | null };

/** Map a Prisma Profile row to the public API shape. */
export function toProfileDto(profile: Profile | null): ProfileDto | null {
  if (!profile) {
    return null;
  }

  return {
    skills: profile.skills,
    experienceYears: profile.experienceYears,
    currentRole: profile.currentRole,
    targetRole: profile.targetRole,
    preferredLocation: profile.preferredLocation,
  };
}

/** Map a user + optional profile to UserWithProfileDto. */
export function toUserWithProfileDto(
  user: User & { profile: Profile | null },
): UserWithProfileDto {
  return {
    ...toUserDto(user),
    profile: toProfileDto(user.profile),
  };
}
