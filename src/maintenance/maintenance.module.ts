// Maintenance module — exposes MaintenanceService (job purge / housekeeping).
import { Module } from '@nestjs/common';
import { MaintenanceService } from '@/maintenance/maintenance.service';

@Module({
  providers: [MaintenanceService],
  exports: [MaintenanceService],
})
export class MaintenanceModule {}
