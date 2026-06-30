// Applications HTTP routes — apply/unapply/list under /api/jobs.
import { Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { JwtPayload } from '@/common/types/authed-request.type';
import { ApplicationsService } from '@/applications/applications.service';

@Controller('jobs')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  /** Mark a job as applied (records intent; client opens sourceUrl). */
  @Post('apply/:id')
  apply(@CurrentUser() user: JwtPayload, @Param('id') jobId: string) {
    return this.applicationsService.apply(user.id, jobId);
  }

  /** Remove an application record. */
  @Delete('apply/:id')
  unapply(@CurrentUser() user: JwtPayload, @Param('id') jobId: string) {
    return this.applicationsService.unapply(user.id, jobId);
  }

  /** List all applied jobs for the authenticated user. */
  @Get('applied')
  listApplied(@CurrentUser() user: JwtPayload) {
    return this.applicationsService.listApplied(user.id);
  }
}
