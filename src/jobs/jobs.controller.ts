// Jobs HTTP routes — public read endpoints with optional auth for per-user flags.
import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Public } from '@/common/decorators/public.decorator';
import { OptionalJwtAuthGuard } from '@/common/guards/optional-jwt-auth.guard';
import type { AuthedRequest, JwtPayload } from '@/common/types/authed-request.type';
import { JobQueryDto } from '@/jobs/dto/job-query.dto';
import { SearchQueryDto } from '@/jobs/dto/search-query.dto';
import { JobsService } from '@/jobs/jobs.service';

@Controller('jobs')
@Public()
@UseGuards(OptionalJwtAuthGuard)
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  /** Paginated job list with filters and sort. */
  @Get()
  findAll(@Query() query: JobQueryDto, @Req() req: AuthedRequest) {
    const userId = this.extractUserId(req);
    return this.jobsService.findAll(query, userId);
  }

  /** Top jobs today by view count and recency (max 10). */
  @Get('trending')
  trending(@Req() req: AuthedRequest) {
    const userId = this.extractUserId(req);
    return this.jobsService.trending(userId);
  }

  /** Full-text search across title, company, description, and skills. */
  @Get('search')
  search(@Query() query: SearchQueryDto, @Req() req: AuthedRequest) {
    const userId = this.extractUserId(req);
    return this.jobsService.search(query.q, query.page, query.limit, userId);
  }

  /** Similar jobs by category and skill overlap. */
  @Get('similar/:id')
  similar(
    @Param('id') id: string,
    @Query('limit', new DefaultValuePipe(6), ParseIntPipe) limit: number,
    @Req() req: AuthedRequest,
  ) {
    const userId = this.extractUserId(req);
    const capped = Math.min(Math.max(limit, 1), 6);
    return this.jobsService.similar(id, capped, userId);
  }

  /** Returns user id when optional JWT attached a valid payload. */
  private extractUserId(req: AuthedRequest): string | undefined {
    const user = req.user as JwtPayload | null | undefined;
    return user?.id;
  }
}
