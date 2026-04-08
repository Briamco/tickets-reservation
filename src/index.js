import 'dotenv/config';
import express from "express";
import { createServer } from "http";
import { createClient } from "redis";
import { v4 as uuidv4 } from "uuid";
import { Server as SocketIOServer } from "socket.io";

const PORT = process.env.PORT || 3000;

const app = express();
const server = createServer(app);
const io = new SocketIOServer(server);

function broadcast(event, payload) {
  io.emit(event, payload);
}

io.on("connection", (socket) => {
  socket.emit("connected", { ok: true });
});

app.use(express.json());

const redis = createClient({
  username: 'default',
  password: process.env.REDIS_PASSWORD,
  socket: {
    host: process.env.REDIS_HOST || "localhost",
    port: process.env.REDIS_PORT || 12206
  }
});

redis.on('error', err => console.log('Redis Client Error', err));

await redis.connect();

try {
  await redis.sendCommand(["CONFIG", "SET", "notify-keyspace-events", "Ex"]);
} catch (error) {
  console.warn("Could not enable Redis key expiration notifications", error);
}

const subscriptionClient = redis.duplicate();
await subscriptionClient.connect();

await subscriptionClient.subscribe("__keyevent@0__:expired", async (key) => {
  if (key.startsWith("reservation:")) {
    const available = await redis.incr("tickets:available");
    const reservationId = key.replace("reservation:", "");
    broadcast("reservationExpired", { reservationId, available });
    console.log(`Reservation expired: ${key}`);
  }
});

app.post("/init", async (req, res) => {
  const totalTickets = 100;

  await redis.set("tickets:available", totalTickets);

  res.json({ message: "Tickets initialized", available: totalTickets });
})

app.post("/reserve", async (req, res) => {
  const userId = uuidv4();

  const remaining = await redis.decr("tickets:available");

  if (remaining < 0) {
    await redis.incr("tickets:available");
    return res.status(400).json({ message: "Sold out" });
  }

  const reservationId = uuidv4();

  console.log(`Creating reservation: ${reservationId} for user: ${userId}`);

  await redis.set(
    `reservation:${reservationId}`,
    JSON.stringify({ userId, timestamp: Date.now() }),
    { EX: 300 }
  )

  res.json({ 
    message: "Ticket reserved", 
    reservationId, 
    expiresIn: "5 minutes" 
  });
})

app.get("/reservation/available", async (req, res) => {
  const reservationId = req.query.reservationId;

  const reservation = await redis.get(`reservation:${reservationId}`);

  if (!reservation) {
    return res.status(400).json({ message: "Invalid or expired reservation" });
  }

  console.log(`Checked reservation: ${reservationId}`);
  res.json({ message: "Reservation is still valid" });
})

app.post("/confirm", async (req, res) => {
  const { reservationId } = req.body;
  console.log(`Confirming reservation: ${reservationId}`);

  const reservation = await redis.get(`reservation:${reservationId}`);

  if (!reservation) {
    return res.status(400).json({ message: "Invalid or expired reservation" });
  }

  // Logica para agrear el ticket a la base de datos o sistema de gestión de tickets aquí

  await redis.del(`reservation:${reservationId}`);

  res.json({ 
    message: "Ticket purchase confirmed" 
  });
})

app.delete("/cancel", async (req, res) => {
  const { reservationId } = req.body;
  console.log(`Cancelling reservation: ${reservationId}`);

  const reservation = await redis.get(`reservation:${reservationId}`);

  if (!reservation) {
    return res.status(400).json({ message: "Invalid or expired reservation" });
  }

  await redis.del(`reservation:${reservationId}`);
  await redis.incr("tickets:available");
  
  res.json({ 
    message: "Ticket reservation cancelled" 
  });
})

app.get("/status", async (req, res) => {
  const available = await redis.get("tickets:available");
  res.json({ available: parseInt(available) });
})

app.use(express.static("public"));

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
})
