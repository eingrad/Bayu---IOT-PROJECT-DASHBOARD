const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");

require("dotenv").config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.use("/auth", require("./routes/auth"));
app.use("/api/sensor-data", require("./routes/sensorData"));

app.use("/files", express.static("files"));

app.get("/", (req, res) => res.send("Bayu Public API running"));
app.listen(5050, () => console.log("API on http://localhost:5050"));
