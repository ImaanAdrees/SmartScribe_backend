import mongoose from "mongoose";
import { configDotenv } from "dotenv";
configDotenv();
export const connect_db=async()=>{
    try{
        const url=process.env.DB_URL;
        if(!url)
        {
            throw Error("url not found");
        }
        await mongoose.connect(url);
        console.log("Connection Successful!!");
    }
    catch(error)
    {
        console.log(error);
        process.exit(1);
    }
}