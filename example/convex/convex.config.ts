import { defineApp } from "convex/server";
import booking from "@mrfinch/booking/convex.config.js";

const app = defineApp();
app.use(booking);

export default app;
