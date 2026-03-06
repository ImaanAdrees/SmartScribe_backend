import nodemailer from "nodemailer";

const CONTACT_RECEIVER_EMAIL =
  process.env.CONTACT_RECEIVER_EMAIL || "aismartscribe@gmail.com";

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const createMailTransporter = () => {
  if (!process.env.USER_EMAIL || !process.env.USER_PASSWORD) {
    return null;
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.USER_EMAIL,
      pass: process.env.USER_PASSWORD,
    },
  });
};

const sanitizeLine = (value) =>
  String(value || "")
    .replace(/\r?\n|\r/g, " ")
    .trim();

export const sendContactMessage = async (req, res) => {
  try {
    const name = sanitizeLine(req.body?.name);
    const email = sanitizeLine(req.body?.email).toLowerCase();
    const subject = sanitizeLine(req.body?.subject) || "No Subject";
    const message = String(req.body?.message || "").trim();

    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and message are required",
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address",
      });
    }

    const transporter = createMailTransporter();

    if (!transporter) {
      return res.status(500).json({
        success: false,
        message: "Email service is not configured on server",
      });
    }

    const textBody = [
      "New Contact Message",
      "",
      `Name: ${name}`,
      `Email: ${email}`,
      `Subject: ${subject}`,
      "",
      "Message:",
      message,
    ].join("\n");

    await transporter.sendMail({
      from: process.env.USER_EMAIL,
      to: CONTACT_RECEIVER_EMAIL,
      replyTo: email,
      subject: `[SmartScribe Contact] ${subject}`,
      text: textBody,
    });

    return res.status(200).json({
      success: true,
      message: "Message sent successfully",
    });
  } catch (error) {
    console.error("Contact message send error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send message. Please try again later.",
    });
  }
};
