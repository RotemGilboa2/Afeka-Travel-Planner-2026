require("dotenv").config();


const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const OpenAI = require("openai");


const User = require("./models/User");
const Route = require("./models/Route");


const app = express();

app.use(express.json({ limit: "2mb" }));

app.use(express.urlencoded({ extended: true }));

app.use(cookieParser());

app.use(
  cors({
    origin: [
      'http://localhost:3000',
      'https://afeka-travel-planner-2026-1.onrender.com'
    ],
    credentials: true,
  })
);


mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("Mongo error:", err));

// ---------- GROQ LLM CLIENT ----------

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

// ---------- JWT helpers ----------


function signAccessToken(payload) {
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.ACCESS_EXPIRES || '1d',
  });
}

function signRefreshToken(payload) {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.REFRESH_EXPIRES,
  });
}

function setAuthCookies(res, accessToken, refreshToken) {
  res.cookie("access_token", accessToken, {
    httpOnly: true,
    sameSite: "none",
    secure: true,
    maxAge: 1000 * 60 * 60 * 24,
  });

  res.cookie("refresh_token", refreshToken, {
    httpOnly: true,
    sameSite: "none",
    secure: true,
    maxAge: 1000 * 60 * 60 * 24 * 30,
  });
}

// ---------- Middleware ----------


function requireAuth(req, res, next) {
  const token = req.cookies.access_token;
  if (!token) return res.status(401).json({ error: "Missing token" });

  try {
    req.user = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// ---------- AUTH ----------


app.post("/auth/register", async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) return res.status(400).json({ error: "Missing fields" });
  const exists = await User.findOne({ email });
  if (exists) return res.status(409).json({ error: "User exists" });
  const passHash = await bcrypt.hash(password, 12);
  await User.create({ email, name, passHash });
  res.json({ ok: true });
});


app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(401).json({ error: "Bad credentials" });
  const valid = await bcrypt.compare(password, user.passHash);
  if (!valid) return res.status(401).json({ error: "Bad credentials" });


  const payload = {
    email: user.email,
    presenters: ["Maayan Shani", "Rotem Gilboa"],
  };


  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  setAuthCookies(res, accessToken, refreshToken);
  res.json({ ok: true });
});

// logout
app.post("/auth/logout", (req, res) => {
  res.clearCookie("access_token", { sameSite: 'none', secure: true });
  res.clearCookie("refresh_token");
  res.json({ ok: true });
});

// refresh token
app.post("/auth/refresh", async (req, res) => {
  const refreshToken = req.cookies.refresh_token;
  if (!refreshToken) return res.status(401).json({ error: "Missing refresh token" });
  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findOne({ email: payload.email });
    if (!user) return res.status(401).json({ error: "User not found" });

    const newAccessToken = signAccessToken({
      email: user.email,
      presenters: ["Maayan Shani", "Rotem Gilboa"],
    });

    res.cookie("access_token", newAccessToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 1000 * 60 * 60 * 24,
    });
    return res.json({ ok: true });
  } catch {
    return res.status(401).json({ error: "Invalid refresh token" });
  }
});


app.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// ---------- LLM ROUTE ----------


app.post("/ai/trip", requireAuth, async (req, res) => {
  try {
    const { city, tripType, days, daysPlan } = req.body;
    const dailyLines = Array.isArray(daysPlan) && daysPlan.length > 0
      ? daysPlan.map((d) => `Day ${d.dayIndex}: exactly ${Number(d.distanceKm).toFixed(2)} km`).join("\n")
      : `Days: ${days}`;

    const prompt = `
You are a local travel expert. The user is going on a ${tripType} trip in ${city}.
Specific route distances for each day:
${dailyLines}

Your task: For each day, suggest 2-3 specific local restaurants/cafes and 2-3 interesting attractions or viewpoints.

Return JSON ONLY in this format:
{
"title": "Culinary & Discovery Guide for ${city}",
"summary": "A brief overview.",
"days":[
 { "day": 1, "distance": "...", "description": "RESTAURANTS: [...]. ATTRACTIONS: [...]" }
]
}
`;


    const response = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
      response_format: { type: "json_object" },
    });

    res.json({ ok: true, text: response.choices[0].message.content });
  } catch (err) {
    console.error("AI Error:", err);
    res.status(500).json({ error: "AI generation failed" });
  }
});

// ---------- ROUTES (Updated to save aiDescription) ----------

app.post("/routes", requireAuth, async (req, res) => {
  try {
    const {
      city, tripType, days, totalDistanceKm, geometry, daysPlan, imageUrl, aiDescription
    } = req.body;

    const newRoute = await Route.create({
      city, tripType, days, totalDistanceKm, geometry, daysPlan, imageUrl,
      aiDescription,
      userEmail: req.user.email,
    });

    res.json({ ok: true, route: newRoute });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});


app.get("/routes", requireAuth, async (req, res) => {
  const routes = await Route.find({ userEmail: req.user.email }).sort({ createdAt: -1 });
  res.json(routes);
});


app.listen(4000, () => {
  console.log("Server running on http://localhost:4000");
});
