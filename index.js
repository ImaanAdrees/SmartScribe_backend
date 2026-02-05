import "./loadenv.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import {createServer} from "http"
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import { connect_db } from "./src/config/mongo_connection.js";
import authRoutes from "./src/routes/authRoutes.js";
import userRoutes from "./src/routes/userRoutes.js";
import notificationRoutes from "./src/routes/notificationRoutes.js";

const app=express();
const server = createServer(app);
connect_db();

// Security middleware
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(bodyParser.json());
app.use(cors({
    origin:process.env.FRONT_URL,
    credentials:true,
}));

// Trust proxy to get real IP addresses (important for rate limiting)
app.set('trust proxy', 1);

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/notifications", notificationRoutes);




server.listen(5000,()=>{console.log("server is listing on port no 5000")})