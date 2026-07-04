// Profile CRUD, match score, and personalized job recommendations.
import { Injectable } from '@nestjs/common';
import { Job, JobCategory, Prisma } from '@/generated/prisma';
import { appError } from '@/common/constants/error-codes';
import { listableJobsWhere } from '@/common/constants/job-list.constants';
import {
  classifyCategory,
  normalizeSkill,
} from '@/common/utils/normalize.util';
import { PrismaService } from '@/prisma/prisma.service';
import { JobCardDto } from '@/jobs/dto/job-response.dto';
import { toJobCardDto } from '@/jobs/jobs.mapper';
import { UpdateProfileDto } from '@/users/dto/update-profile.dto';
import {
  ProfileDto,
  toProfileDto,
  toUserWithProfileDto,
  UserWithProfileDto,
} from '@/users/dto/profile-response.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Return the authenticated user with career profile. */
  async getMe(userId: string): Promise<UserWithProfileDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });

    if (!user) {
      throw appError('USER_NOT_FOUND');
    }

    return toUserWithProfileDto(user);
  }

  /** Upsert career profile fields (skills normalized on save). */
  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<ProfileDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw appError('USER_NOT_FOUND');
    }

    const data: Prisma.ProfileUpdateInput = {};

    if (dto.skills !== undefined) {
      data.skills = [
        ...new Set(dto.skills.map((s) => normalizeSkill(s)).filter(Boolean)),
      ];
    }
    if (dto.experienceYears !== undefined) {
      data.experienceYears = dto.experienceYears;
    }
    if (dto.currentRole !== undefined) {
      data.currentRole = dto.currentRole?.trim() || null;
    }
    if (dto.targetRole !== undefined) {
      data.targetRole = dto.targetRole?.trim() || null;
    }
    if (dto.preferredLocation !== undefined) {
      data.preferredLocation = dto.preferredLocation?.trim() || null;
    }

    const profile = await this.prisma.profile.upsert({
      where: { userId },
      create: {
        userId,
        skills: data.skills ? (data.skills as string[]) : [],
        experienceYears:
          typeof data.experienceYears === 'number' ? data.experienceYears : 0,
        currentRole:
          typeof data.currentRole === 'string' ? data.currentRole : null,
        targetRole: typeof data.targetRole === 'string' ? data.targetRole : null,
        preferredLocation:
          typeof data.preferredLocation === 'string'
            ? data.preferredLocation
            : null,
      },
      update: data,
    });

    return toProfileDto(profile)!;
  }

  /**
   * Percentage of listable active jobs that overlap the user's skills
   * or match their target role category.
   */
  async matchScore(userId: string): Promise<{ score: number }> {
    const profile = await this.loadProfile(userId);
    const skills = profile?.skills ?? [];
    const targetCategory = this.targetRoleCategory(profile?.targetRole);

    const baseWhere = listableJobsWhere();
    const total = await this.prisma.job.count({ where: baseWhere });
    if (total === 0) {
      return { score: 0 };
    }

    const matchConditions = this.buildMatchConditions(skills, targetCategory);
    if (matchConditions.length === 0) {
      return { score: 0 };
    }

    const matched = await this.prisma.job.count({
      where: {
        ...baseWhere,
        OR: matchConditions,
      },
    });

    return { score: Math.round((matched / total) * 100) };
  }

  /** Active jobs ranked by skill overlap with the user's profile. */
  async recommendations(userId: string, limit: number): Promise<JobCardDto[]> {
    const profile = await this.loadProfile(userId);
    const skills = profile?.skills ?? [];
    const take = Math.min(Math.max(limit, 1), 50);

    const where = listableJobsWhere(
      skills.length > 0 ? { skills: { hasSome: skills } } : {},
    );

    const candidates = await this.prisma.job.findMany({
      where,
      take: Math.max(take * 5, 30),
      orderBy: [{ postedAt: 'desc' }],
    });

    const ranked = this.rankBySkillOverlap(candidates, skills).slice(0, take);
    const flags = await this.getUserFlags(
      userId,
      ranked.map((job) => job.id),
    );

    return ranked.map((job) =>
      toJobCardDto(job, {
        isSaved: flags.saved.has(job.id),
        isApplied: flags.applied.has(job.id),
      }),
    );
  }

  private async loadProfile(userId: string) {
    return this.prisma.profile.findUnique({ where: { userId } });
  }

  private targetRoleCategory(
    targetRole: string | null | undefined,
  ): JobCategory | null {
    if (!targetRole?.trim()) {
      return null;
    }

    const category = classifyCategory(targetRole, []);
    return category === JobCategory.OTHER ? null : category;
  }

  private buildMatchConditions(
    skills: string[],
    targetCategory: JobCategory | null,
  ): Prisma.JobWhereInput[] {
    const conditions: Prisma.JobWhereInput[] = [];

    if (skills.length > 0) {
      conditions.push({ skills: { hasSome: skills } });
    }
    if (targetCategory) {
      conditions.push({ category: targetCategory });
    }

    return conditions;
  }

  private rankBySkillOverlap(jobs: Job[], profileSkills: string[]): Job[] {
    const normalized = profileSkills.map((s) => s.toLowerCase());

    return [...jobs]
      .map((job) => ({
        job,
        overlap: job.skills.filter((skill) =>
          normalized.includes(skill.toLowerCase()),
        ).length,
      }))
      .sort(
        (a, b) =>
          b.overlap - a.overlap ||
          b.job.postedAt.getTime() - a.job.postedAt.getTime(),
      )
      .map((row) => row.job);
  }

  private async getUserFlags(
    userId: string,
    jobIds: string[],
  ): Promise<{ saved: Set<string>; applied: Set<string> }> {
    const saved = new Set<string>();
    const applied = new Set<string>();

    if (jobIds.length === 0) {
      return { saved, applied };
    }

    const [savedRows, appliedRows] = await Promise.all([
      this.prisma.savedJob.findMany({
        where: { userId, jobId: { in: jobIds } },
        select: { jobId: true },
      }),
      this.prisma.application.findMany({
        where: { userId, jobId: { in: jobIds } },
        select: { jobId: true },
      }),
    ]);

    for (const row of savedRows) {
      saved.add(row.jobId);
    }
    for (const row of appliedRows) {
      applied.add(row.jobId);
    }

    return { saved, applied };
  }
}
