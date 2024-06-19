import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import pg from "pg";
import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy } from "passport-local";
import GoogleStrategy from "passport-google-oauth2";
import session from "express-session";
import env from "dotenv";

const app = express();
const port = 3000;
const saltRounds = 10;
const API_URL = "https://work-out-api1.p.rapidapi.com/search";
var currentMuscle = "";
var currentIntensity = "";
var currentEquipment = null;
var currentUser;
env.config();

app.use(
  session({
    secret: "TOPSECRETWORD",
    resave: false,
    saveUninitialized: true,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24,
    },
  })
);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(passport.initialize());
app.use(passport.session());

const db = new pg.Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});
db.connect();

function parseData(data) {
  const resultArray = [];

  for (const day in data) {
    if (data.hasOwnProperty(day)) {
      data[day].forEach((muscle) => {
        resultArray.push(`${day}-${muscle}`);
      });
    }
  }
  return resultArray;
}

function splitString(str) {
  var date = "";
  var text = "";
  var i = 0;
  while (i < str.length && str[i] != "#") {
    date += str[i];
    i++;
  }
  i++;
  while (i < str.length) {
    text += str[i];
    i++;
  }
  return [date, text];
}

app.get("/home", (req, res) => {
  console.log(currentUser);
  if (currentUser) {
    res.render("home.ejs", {
      username: currentUser.name,
    });
  } else res.render("home.ejs");
});

app.get("/home/info", async (req, res) => {
  console.log("current M: " + currentMuscle);
  console.log("current I: " + currentIntensity);
  console.log("current E: " + currentEquipment);

  try {
    const response = await axios.get(API_URL, {
      params: {
        Muscles: currentMuscle,
        Intensity_Level: currentIntensity,
        Equipment: currentEquipment,
      },
      headers: {
        "x-rapidapi-key": "78914fac3bmshf0fc97e3ac765fdp1f7d5fjsn8652559b2698",
        "x-rapidapi-host": "work-out-api1.p.rapidapi.com",
      },
    });

    res.render("info.ejs", {
      data: response.data,
    });
  } catch (error) {
    res.status(404).send(error);
  }

  currentMuscle = "";
  currentIntensity = "";
  currentEquipment = null;
});

app.get("/home/plans", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT plans FROM workouts JOIN users ON users.id = workouts.user_id WHERE users.id = $1",
      [currentUser.id]
    );
    res.render("plans.ejs", {
      data: result.rows[0],
    });
  } catch (err) {
    res.redirect("/");
    console.log(err);
  }
});

app.get("/", (req, res) => {
  res.render("signin.ejs");
});

app.get("/signup", (req, res) => {
  res.render("signup.ejs");
});

app.get(
  "/auth/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
  })
);

app.get(
  "/auth/google/home",
  passport.authenticate("google", {
    successRedirect: "/home",
    failureRedirect: "/",
  })
);

app.get("/contact", (req, res) => {
  res.render("contact.ejs");
});

app.get("/pr", async (req, res) => {
  try {
    const result = await db.query("SELECT pr FROM prs WHERE user_id = $1", [
      currentUser.id,
    ]);

    if (result.rows[0]) {
      const arrayOfString = result.rows[0].pr;
      const arrayOfObjects = arrayOfString.map((text, index) => ({
        id: index,
        date: splitString(text)[0],
        text: splitString(text)[1],
      }));

      console.log(arrayOfObjects);

      res.render("pr.ejs", { data: arrayOfObjects });
    } else {
      await db.query("INSERT INTO prs (user_id, pr) VALUES ($1, $2)", [
        currentUser.id,
        [],
      ]);
      res.render("pr.ejs", { data: [] });
    }
  } catch (err) {
    console.error("Error fetching PRs:", err);
    res.status(500).send("Error fetching PRs. Please try again later.");
  }
});

app.post("/pr", async (req, res) => {
  if (req.body.toDelete) {

    console.log(req.body.toDelete);

    const result = await db.query("SELECT pr FROM prs WHERE user_id = $1", [
      currentUser.id,
    ]);

    var arr = result.rows[0].pr;

    console.log("arr->" + arr);
    
    arr = arr.filter((str) => {
      return str != req.body.toDelete;
    });
    
    console.log("arr->" + arr);

    await db.query("UPDATE prs SET pr = $1 WHERE user_id = $2", [
      arr,
      currentUser.id,
    ]);
    
    res.redirect("/pr");
    return;
  }

  try {
    const result = await db.query("SELECT pr FROM prs WHERE user_id = $1", [
      currentUser.id,
    ]);
    var arr = result.rows[0].pr;
    arr = [...arr, req.body["pr-date"] + "#" + req.body["pr-text"]];
    await db.query("UPDATE prs SET pr = $1 WHERE user_id = $2", [
      arr,
      currentUser.id,
    ]);
  } catch (err) {
    console.log(err);
  }
  res.redirect("/pr");
});

app.post("/home", (req, res) => {
  if (req.body.final === "") {
    res.redirect("/home/info");
    return;
  } else if (req.body.plans === "") {
    res.redirect("/home/plans");
    return;
  } else if (req.body.pr === "") {
    res.redirect("/pr");
    return;
  }

  if (req.body.muscle) currentMuscle = req.body.muscle;
  else if (req.body.skill) currentIntensity = req.body.skill;
  else if (req.body.eqp) currentEquipment = req.body.eqp;
  else if (req.body.eqp == "") currentEquipment = null;

  res.redirect("/home");
});

app.post("/home/info", (req, res) => {
  res.redirect("/home");
});

app.post("/home/plans", async (req, res) => {
  const data = parseData(req.body);
  try {
    await db.query("delete from workouts where user_id = $1", [currentUser.id]);

    try {
      await db.query(
        "INSERT INTO workouts (user_id, plans) VALUES ($1, $2::text[])",
        [currentUser.id, data]
      );
      res.redirect("/home/plans");
    } catch (err) {
      console.log(err);
    }
  } catch (err) {
    console.log(err);
  }
});

app.post("/signup", async (req, res) => {
  const email = req.body.email;
  const password = req.body.password;
  const name = req.body.name;

  try {
    const checkResult = await db.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    if (checkResult.rows.length > 0) {
      res.send("Email already exists. Try logging in.");
    } else {
      bcrypt.hash(password, saltRounds, async (err, hash) => {
        if (err) {
          console.error("Error hashing password:", err);
        } else {
          const result = await db.query(
            "INSERT INTO users (email, password, name) VALUES ($1, $2, $3) RETURNING *",
            [email, hash, name]
          );
          const user = result.rows[0];
          currentUser = user;
          req.login(user, (err) => {
            res.redirect("/home");
          });
        }
      });
    }
  } catch (err) {
    console.log(err);
  }
});

app.post(
  "/",
  passport.authenticate("local", {
    successRedirect: "/home",
    failureRedirect: "/",
  })
);

passport.use(
  new Strategy(
    {
      usernameField: "email",
      passwordField: "password",
    },
    async function (email, password, done) {
      try {
        const result = await db.query("SELECT * FROM users WHERE email = $1", [
          email,
        ]);
        if (result.rows.length > 0) {
          const user = result.rows[0];
          const storedHashedPassword = user.password;
          bcrypt.compare(password, storedHashedPassword, (err, valid) => {
            if (err) {
              console.error("Error comparing passwords:", err);
              return done(err);
            } else {
              if (valid) {
                currentUser = user;
                return done(null, user);
              } else {
                return done(null, false, { message: "Incorrect password." });
              }
            }
          });
        } else {
          console.log("User not found");
          return done(null, false, { message: "User not found." });
        }
      } catch (err) {
        return done(err);
      }
    }
  )
);

passport.use(
  "google",
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "http://localhost:3000/auth/google/home",
      userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo",
    },
    async (accessToken, refreshToken, profile, cb) => {
      try {
        console.log(profile);
        const result = await db.query("SELECT * FROM users WHERE email = $1", [
          profile.email,
        ]);
        if (result.rows.length === 0) {
          const newUser = await db.query(
            "INSERT INTO users (email, password, name) VALUES ($1, $2, $3)",
            [profile.email, "google", profile.given_name]
          );
          currentUser = newUser;
          return cb(null, newUser.rows[0]);
        } else {
          currentUser = result.rows[0];
          return cb(null, result.rows[0]);
        }
      } catch (err) {
        return cb(err);
      }
    }
  )
);

passport.serializeUser((user, cb) => {
  cb(null, user);
});

passport.deserializeUser((user, cb) => {
  cb(null, user);
});

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
