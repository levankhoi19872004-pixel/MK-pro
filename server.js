const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

let orders = [];

app.get("/", (req, res) => {
  res.send("API kho Minh Khai đang chạy");
});

app.get("/api/orders", (req, res) => {
  res.json(orders);
});

app.post("/api/orders", (req, res) => {
  const order = {
    id: Date.now(),
    ...req.body
  };
  orders.push(order);
  res.json(order);
});

app.delete("/api/orders/:id", (req, res) => {
  orders = orders.filter(o => o.id != req.params.id);
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server chạy cổng " + PORT);
});