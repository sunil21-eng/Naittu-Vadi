const mongoose=require('mongoose');
const connectDatabase= async ()=>{

    try {
        const con = await mongoose.connect(process.env.DB_MONGO_URI);
        console.log(`✅ MongoDB connected: ${con.connection.host}`);
    } catch (err) {
        console.error(" MongoDB connection error:", err.message);
        process.exit(1); 
    }
}

module.exports= connectDatabase;