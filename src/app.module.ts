import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ALIAS_CHECK } from '@/alias-check';

// Phase 0: touch alias import so @/* resolves at build time
void ALIAS_CHECK;

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
