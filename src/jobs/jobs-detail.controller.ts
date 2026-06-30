// Job detail route — separate controller so :id registers after static /jobs/* paths.
import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { Public } from '@/common/decorators/public.decorator';
import { OptionalJwtAuthGuard } from '@/common/guards/optional-jwt-auth.guard';
import type {
  AuthedRequest,
  JwtPayload,
} from '@/common/types/authed-request.type';
import { JobsService } from '@/jobs/jobs.service';

@Controller('jobs')
@Public()
@UseGuards(OptionalJwtAuthGuard)
export class JobsDetailController {
  constructor(private readonly jobsService: JobsService) {}

  /** Job detail — increments viewCount and returns market insight. */
  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: AuthedRequest) {
    const user = req.user as JwtPayload | null | undefined;
    return this.jobsService.findOne(id, user?.id);
  }
}
