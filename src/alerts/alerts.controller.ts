// Alerts HTTP routes — auth required, owner-scoped.
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { JwtPayload } from '@/common/types/authed-request.type';
import { CreateAlertDto } from '@/alerts/dto/create-alert.dto';
import { UpdateAlertDto } from '@/alerts/dto/update-alert.dto';
import { AlertsService } from '@/alerts/alerts.service';

@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  /** List all alerts for the authenticated user. */
  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.alertsService.list(user.id);
  }

  /** Create a new job alert. */
  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateAlertDto) {
    return this.alertsService.create(user.id, dto);
  }

  /** Update an existing alert (owner only). */
  @Put(':id')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateAlertDto,
  ) {
    return this.alertsService.update(user.id, id, dto);
  }

  /** Delete an alert (owner only). */
  @Delete(':id')
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.alertsService.remove(user.id, id);
  }

  /** Send a test email with current matches. */
  @Post(':id/test')
  test(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.alertsService.test(user.id, id);
  }

  /** Preview how many jobs matched in the last 7 days. */
  @Get(':id/preview')
  preview(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.alertsService.preview(user.id, id);
  }
}
