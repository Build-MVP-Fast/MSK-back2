import { Module } from '@nestjs/common';
import { RoomTypesController } from './room-types.controller';
import { RoomTypesService } from './room-types.service';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

@Module({
  controllers: [RoomsController, RoomTypesController],
  providers: [RoomsService, RoomTypesService],
  exports: [RoomsService, RoomTypesService],
})
export class RoomsModule {}
