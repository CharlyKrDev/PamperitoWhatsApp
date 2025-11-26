import app from "./app.js";
import dotenv from "dotenv";
dotenv.config();
import { startSessionWatcher } from "./modules/whatsApp/cron/sessionWatcher.js";





const PORT = process.env.PORT || 3000;
startSessionWatcher();
app.listen(PORT, () => console.log(`Servidor escuchando en puerto ${PORT}`));
