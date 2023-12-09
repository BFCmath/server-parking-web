import express from "express";
import mySQL from "mysql2";
import cors from "cors"   
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
const salt = 10;
dotenv.config();
const app = express();  
app.use(express.json());
app.use(cors({
    origin: [process.env.ORIGIN],
    methods: ["GET", "POST"],
    credentials: true
}));
app.use(cookieParser());

const userDatabase = mySQL.createConnection({
    host: process.env.USER_DB_HOST,
    user: process.env.USER_DB_USER,
    password: process.env.USER_DB_PASSWORD,
    database: process.env.USER_DB_NAME
});

const parkingDatabase = mySQL.createConnection({
    host: process.env.PARKING_DB_HOST,
    user: process.env.PARKING_DB_USER,
    password: process.env.PARKING_DB_PASSWORD,
    database: process.env.PARKING_DB_NAME
});
// const userDatabase = mySQL.createConnection({
//     host : "127.0.0.1",
//     user: "root",
//     password: "20122005Math@",
//     database: "user"
// });

// const parkingDatabase = mySQL.createConnection({
//     host : "127.0.0.1",
//     user: "root",
//     password: "20122005Math@",
//     database: "parking"
// });


userDatabase.connect((err)=>{
    if(err){
        console.log(err);
    }
    else{
        console.log("userDB Connected...");
    }
});
parkingDatabase.connect((err)=>{
    if(err){
        console.log(err);
    }
    else{
        console.log("parkingDB Connected...");
    }
});

const verifyUser = (req, res, next) => {
    const token = req.cookies.token;
    if (!token) {
        return res.json({ Error: "You are not authenticated"});
    }
    else{
        jwt.verify(token, 'fwt-secret-key', (err, decoded) => {
            if (err) {
                return res.json({ Error: "Token is not okay"});
            }
            else{
                req.name = decoded.name;
                req.email = decoded.email;
                req.student_id = decoded.student_id;
                next();
            }
        });
    }
};

app.get('/',verifyUser,(req,res)=>{
    return res.json({Status: "Success",name: req.name, email: req.email, student_id: req.student_id});
});
app.get('/parking-data', (req, res) => {
    // Get student_id from query string
    const studentId = req.query.student_id;
    if (!studentId) {
        return res.status(400).json({ message: "No student ID provided",error: err.message });
    }

    const sql = "SELECT * FROM parking_event WHERE student_id = ?";
    parkingDatabase.query(sql, [studentId], (err, result) => {
        if (err) {
            console.error('Error fetching parking data:', err);
            return res.status(500).json({ message: "Error fetching parking data", error: err.message });
        }   
        res.json(result);
    });
});

app.get('/user-information', (req, res) => {
    // Get student_id from query string
    const studentId = req.query.student_id;
    if (!studentId) {
        return res.status(400).json({ message: "No student ID provided",error: err.message });
    }

    const sql = "SELECT * FROM user_information WHERE student_id = ?";
    userDatabase.query(sql, [studentId], (err, result) => {
        if (err) {
            console.error('Error fetching user data:', err);
            return res.status(500).json({ message: "Error fetching user data", error: err.message });
        }   
        res.json(result);
    });
});
app.post('/parking-data/pay', (req, res) => {
    const parkingSQL = "UPDATE parking_event SET is_paid = 1 WHERE student_id = ? AND is_paid = 0 AND time_out is not NULL;";
    parkingDatabase.query(parkingSQL, [req.body.student_id], (err, result) => {
        if (err) {
            console.error('Error paying parking:', err);
            return res.status(500).json({ message: "Error paying parking", error: err.message });
        }
    });
    const userSQL = "UPDATE user_information SET saving = ? WHERE student_id = ?";
    userDatabase.query(userSQL, [req.body.remainingBalance, req.body.student_id], (err, result) => {
        if (err) {
            console.error('Error paying parking:', err);
            return res.status(500).json({ message: "Error paying parking", error: err.message });
        }
        return res.json({ message: "Paid parking successfully" });
    });
});
app.get('/logout', (req, res) => {
    res.clearCookie('token', { secure: true, sameSite: 'None' });
    return res.json({Status: "Success"});
});

app.post('/user-information/add-money', (req, res) => {
    const addMoneySql = "UPDATE user_information SET saving = saving + ? WHERE student_id = ?";
    userDatabase.query(addMoneySql, [req.body.money_add, req.body.student_id], (err, result) => {
        if (err) {
            console.error('Error adding money:', err);
            return res.status(500).json({ message: "Error adding money", error: err.message });
        }
        return res.json({ message: "Added money successfully" });
    });
});

app.post('/register', (req, res) => {
    // Check if the email already exists
    const checkEmailSql = "SELECT * FROM login WHERE email = ?";
    userDatabase.query(checkEmailSql, [req.body.email], (emailErr, emailResult) => {
        if (emailErr) {
            console.error('Error checking email:', emailErr);
            return res.status(500).json({ message: "Error checking email", error: emailErr.message });
        }
        if (emailResult.length > 0) {
            // If an email record is found, send an error response
            return res.status(400).json({ message: "Email already exists" });
        } else {
            // Check if the student_ID already exists
            const checkStudentIdSql = "SELECT * FROM login WHERE student_id = ?";
            userDatabase.query(checkStudentIdSql, [req.body.student_id], (err, result) => {
                if (err) {
                    console.error('Error checking student id:', err);
                    return res.status(500).json({ message: "Error checking student id", error: err.message });
                }
                if (result.length > 0) {
                    // If a student ID record is found, send an error response
                    return res.status(400).json({ message: "Student id already exists" });
                } else {
                    // If no record is found, proceed with registration
                    bcrypt.hash(req.body.password.toString(), salt, (hashErr, hash) => {
                        if (hashErr) {
                            console.error('Error hashing password:', hashErr);
                            return res.status(500).json({ message: "Error in hashing password", error: hashErr.message });
                        }
                        const values = [req.body.name, req.body.student_id, req.body.email, hash];
                        const sql = "INSERT INTO login (`name`, `student_id`, `email`, `password`) VALUES (?)";
                        userDatabase.query(sql, [values], (insertErr, insertResult) => {
                            if (insertErr) {
                                console.error('Error inserting values:', values, 'Error:', insertErr);
                                return res.status(500).json({ message: "Error in inserting values", values, error: insertErr.message });
                            } else {
                                return res.json({ message: "Registered Successfully" });
                            }
                        });
                    });
                }
            });
        }
    });
});

app.post('/login', (req, res) => {
    const sql = "SELECT * FROM login WHERE email = ?";
    userDatabase.query(sql, [req.body.email], (err, result) => {
        if (err) {
            console.error('Error in query:', err); // Print to the server terminal
            return res.json({ message: "User not found", error: err.message });
        }
        if (result.length == 0) {
            return res.json({ message: "User not found"});
        }
        bcrypt.compare(req.body.password.toString(), result[0].password, (err, result2) => {
            if (err) {
                console.error('Error comparing passwords:', err); // Print to the server terminal
                return res.json({ message: "Error comparing passwords", error: err.message });
            }
            if (result2 == false) {
                return res.json({message: "Wrong Password"});
            }
            const name = result[0].name;
            const email = result[0].email; // Get the email from the query result
            const student_id = result[0].student_id;
            const token = jwt.sign(
                { name, email, student_id}, // Include both name and email in the payload
                'fwt-secret-key',
                { expiresIn: '1h' }
            );
            console.log(token);
            res.cookie('token', token, { secure: true, sameSite: 'None' });
            return res.json({Status: "Success"});
        });
    });
}); 
const PORT = process.env.PORT || 3000;
app.listen(PORT,()=>{
    console.log(`Server is running on port ${PORT}`);
})