import { Module } from '@nestjs/common';
import { RoomsGateway } from './rooms.gateway';
import { RoomsService } from './rooms.service';
import { AvatarsService } from './avatars.service';

@Module({
  providers: [RoomsGateway, RoomsService, AvatarsService],
  exports: [RoomsService, AvatarsService],
})
export class RoomsModule {}
