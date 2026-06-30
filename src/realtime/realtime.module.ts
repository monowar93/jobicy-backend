// Realtime module — Socket.io gateway + thin service for other modules.
import { Module } from '@nestjs/common';
import { RealtimeGateway } from '@/realtime/realtime.gateway';
import { RealtimeService } from '@/realtime/realtime.service';

@Module({
  providers: [RealtimeGateway, RealtimeService],
  exports: [RealtimeService, RealtimeGateway],
})
export class RealtimeModule {}
