import "./loadenv.js";
import express from "express";
import cors from "cors";
import {createServer} from "http"
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import { connect_db } from "./src/config/mongo_connection.js";
import authRoutes from "./src/routes/authRoutes.js";
const app=express();
const server = createServer(app);
connect_db();
app.use(bodyParser.json());
app.use(cors({
    origin:process.env.FRONT_URL,
    credentials:true,
}));


app.use("/api/auth", authRoutes);




server.listen(5000,()=>{console.log("server is listing on port no 5000")})