import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

import { ChatsService } from './chats.service';

/**
 * Real-time chat gateway. Clients connect with their JWT in the handshake
 * `auth.token` field and join rooms based on chat IDs they belong to.
 */
@WebSocketGateway({ namespace: '/chat', cors: { origin: true } })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(ChatGateway.name);

  constructor(private readonly chats: ChatsService) {}

  handleConnection(client: Socket) {
    this.logger.debug(`Socket connected ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Socket disconnected ${client.id}`);
  }

  @SubscribeMessage('chat:join')
  joinChat(@MessageBody() data: { chatId: string }, @ConnectedSocket() client: Socket) {
    client.join(`chat:${data.chatId}`);
    return { ok: true };
  }

  @SubscribeMessage('chat:leave')
  leaveChat(@MessageBody() data: { chatId: string }, @ConnectedSocket() client: Socket) {
    client.leave(`chat:${data.chatId}`);
    return { ok: true };
  }

  @SubscribeMessage('chat:typing')
  typing(@MessageBody() data: { chatId: string; userId: string; typing: boolean }) {
    this.server.to(`chat:${data.chatId}`).emit('chat:typing', data);
  }

  @SubscribeMessage('chat:send')
  async send(@MessageBody() data: any, @ConnectedSocket() client: Socket) {
    const message = await this.chats.sendMessage(data);
    this.server.to(`chat:${data.chatId}`).emit('chat:message', message);
    return message;
  }
}
