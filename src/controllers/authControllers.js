import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { connection } from "mongoose";

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "7d" });
};

// User Signup
export const signup = async (req, res) => {
  const { name, email, password } = req.body;

  const userExists = await User.findOne({ email });
  if (userExists)
    return res.status(400).json({ message: "User already exists" });

  const user = await User.create({ name, email, password });

  res.status(201).json({
    _id: user._id,
    name: user.name,
    email: user.email,
    token: generateToken(user._id),
  });
};

// User Login
export const login = async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });
  if (user && (await user.matchPassword(password))) {
    res.json({
      _id: user._id,
      email: user.email,
      isAdmin: user.isAdmin,
      token: generateToken(user._id),
    });
  } else {
    res.status(401).json({ message: "Invalid email or password" });
  }
};

// Admin Login
export const adminLogin = async (req, res) => {
  const { email, password } = req.body;

  const admin = await User.findOne({ email, isAdmin: true });

  if (admin && (await admin.matchPassword(password))) {
    res.json({
      _id: admin._id,
      email: admin.email,
      token: generateToken(admin._id),
    });
    console.log("Admin login successfully!!");
  } else {
    res.status(401).json({ message: "Admin credentials invalid" });
  }
};
export const adminLogout = (req, res) => {
  res.status(200).json({
    message: "Admin logged out successfully",
  });
};
