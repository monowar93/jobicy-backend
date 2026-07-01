// Admin HTTP routes — ADMIN role required on every endpoint (02 §8).
import { Controller, Get, Post, Query } from '@nestjs/common';
import { Roles } from '@/common/decorators/roles.decorator';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { Role } from '@/generated/prisma';
import { AdminService } from '@/admin/admin.service';

@Controller('admin')
@Roles(Role.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /** Platform-wide counts (users, jobs, alerts, applications). */
  @Get('stats')
  stats() {
    return this.adminService.stats();
  }

  /** Paginated ingestion fetch logs, newest first. */
  @Get('fetch/logs')
  fetchLogs(@Query() query: PaginationQueryDto) {
    return this.adminService.fetchLogs(query.page, query.limit);
  }

  /** Enqueue an immediate multi-source ingestion run. */
  @Post('fetch/trigger')
  triggerFetch() {
    return this.adminService.triggerFetch();
  }

  /** BullMQ queue health (active / waiting / completed / failed). */
  @Get('queues')
  queues() {
    return this.adminService.queues();
  }

  /** Paginated user list (safe shape, no passwords). */
  @Get('users')
  listUsers(@Query() query: PaginationQueryDto) {
    return this.adminService.users(query.page, query.limit);
  }
}
