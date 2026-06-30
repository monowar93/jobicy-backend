// Saved jobs HTTP routes — auth required, mounted under /api/jobs.
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { JwtPayload } from '@/common/types/authed-request.type';
import { SaveNoteDto, UpdateNoteDto } from '@/saved-jobs/dto/save-note.dto';
import { SavedJobsService } from '@/saved-jobs/saved-jobs.service';

@Controller('jobs')
export class SavedJobsController {
  constructor(private readonly savedJobsService: SavedJobsService) {}

  /** List saved jobs for the authenticated user. */
  @Get('saved')
  list(@CurrentUser() user: JwtPayload, @Query('sort') sort?: string) {
    return this.savedJobsService.list(user.id, sort);
  }

  /** Download saved jobs as CSV (bypasses JSON transform interceptor). */
  @Get('saved/export')
  async exportCsv(
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ): Promise<void> {
    const csv = await this.savedJobsService.exportCsv(user.id);
    res
      .type('text/csv')
      .attachment('saved-jobs.csv')
      .send(csv);
  }

  /** Save a job with an optional note. */
  @Post('save/:id')
  save(
    @CurrentUser() user: JwtPayload,
    @Param('id') jobId: string,
    @Body() dto: SaveNoteDto,
  ) {
    return this.savedJobsService.save(user.id, jobId, dto.note);
  }

  /** Update the note on a saved job. */
  @Patch('save/:id')
  updateNote(
    @CurrentUser() user: JwtPayload,
    @Param('id') jobId: string,
    @Body() dto: UpdateNoteDto,
  ) {
    return this.savedJobsService.updateNote(user.id, jobId, dto.note);
  }

  /** Unsave a job. */
  @Delete('save/:id')
  unsave(@CurrentUser() user: JwtPayload, @Param('id') jobId: string) {
    return this.savedJobsService.unsave(user.id, jobId);
  }
}
