import express from "express";
import http from "http";
import { Server } from "socket.io";
import { v4 as uuidv4 } from "uuid";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(join(__dirname, "public")));

const waitingUsers = new Set();
const activeRooms = new Map();

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-chat", () => {
    if (waitingUsers.size > 0) {
      // Pair with waiting user
      const partnerId = Array.from(waitingUsers)[0];
      waitingUsers.delete(partnerId);

      const roomId = uuidv4();
      activeRooms.set(socket.id, roomId);
      activeRooms.set(partnerId, roomId);

      socket.join(roomId);
      io.sockets.sockets.get(partnerId).join(roomId);

      socket.emit("paired", { roomId, isInitiator: true });
      io.to(partnerId).emit("paired", { roomId, isInitiator: false });

      console.log(
        `Paired users: ${socket.id} and ${partnerId} in room ${roomId}`
      );
    } else {
      // Add to waiting list
      waitingUsers.add(socket.id);
      socket.emit("waiting");
      console.log(`User ${socket.id} added to waiting list`);
    }
  });

  socket.on("offer", (data) => {
    socket.to(data.roomId).emit("offer", data.offer);
  });

  socket.on("answer", (data) => {
    socket.to(data.roomId).emit("answer", data.answer);
  });

  socket.on("ice-candidate", (data) => {
    socket.to(data.roomId).emit("ice-candidate", data.candidate);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    // Remove from waiting list if present
    waitingUsers.delete(socket.id);

    // Leave room if in one
    const roomId = activeRooms.get(socket.id);
    if (roomId) {
      socket.to(roomId).emit("partner-disconnected");
      activeRooms.delete(socket.id);

      // Find and notify the other user in the room
      const otherUser = Array.from(activeRooms.entries()).find(
        ([_, rId]) => rId === roomId && _ !== socket.id
      );

      if (otherUser) {
        activeRooms.delete(otherUser[0]);
      }
    }
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
