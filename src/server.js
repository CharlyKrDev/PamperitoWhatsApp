import app from "./index.js";
import dotenv from "dotenv";
dotenv.config();



const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor escuchando en puerto ${PORT}`));

