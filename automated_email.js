// Load environment variables from password.env file
require('dotenv').config({ path: './password.env' });

const nodemailer = require('nodemailer');
const fs = require('fs');
const { Client } = require('pg');
const cron = require('node-cron');

const client = new Client({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASS,
    port: process.env.DB_PORT
});

// Get the current month dynamically
const today = new Date();
const currentMonth = today.getMonth() + 1; // Months are zero-based, so add 1

client.connect()
    .then(() => {
        console.log('Connected to PostgreSQL database');

        // Retrieve incentive details for the current month from the database
        return getDataForCurrentMonth(currentMonth);
    })
    .then(data => {
        // Log the retrieved data
        console.log('Retrieved data:', data);

        // Send emails based on sendType
        const sendType = 'individual'; // Change this to 'individual' or 'consolidated' as needed
        if (sendType === 'individual') {
            return sendIndividualEmails(data, currentMonth)
                .then(() => sendConsolidatedEmail(data, currentMonth)); // Send consolidated email after individual emails
        } else if (sendType === 'consolidated') {
            return sendConsolidatedEmail(data, currentMonth);
        } else {
            console.error('Invalid sendType:', sendType);
            return Promise.reject(new Error('Invalid sendType'));
        }
    })
    .then(() => {
        // Close the database connection
        client.end();
    })
    .catch(error => console.error('Error:', error));

// Function to retrieve incentive details for the current month from the database
async function getDataForCurrentMonth(currentMonth) {
    try {

        // Define your SQL query to fetch incentive details for the current month
        const query = `SELECT * FROM employee_data WHERE EXTRACT(MONTH FROM "Date") = $1`;


        // Execute the query with the current month parameter
        const { rows } = await client.query(query, [currentMonth]);
        return rows;
    } catch (error) {
        throw new Error('Error fetching data:', error);
    }
}

// Function to send individual emails
function sendIndividualEmails(data, currentMonth) {
    const promises = [];
    for (let i = 0; i < data.length; i++) {
        const employeeData = data[i];
        const employeeEmail = employeeData.Email; // Corrected property name
        const employeeName = employeeData.Name; // Corrected property name
        console.log('Sending individual email to:', employeeEmail, 'with name:', employeeName);

        // Compose email subject and body
        const subject = `🎉🌟 Congratulations! 🌟🎉 Incentive Details for ${getMonthName(currentMonth)} 🎁`;
        const body = composeEmailBody(employeeName);

        // Send email and push the promise to the array
        promises.push(sendEmail(employeeEmail, subject, body));
    }
    // Wait for all emails to be sent
    return Promise.all(promises);
}

// Function to send consolidated email
function sendConsolidatedEmail(data, currentMonth) {
    // Compose email subject and body
    const officialEmail = 'rahul_ahlawat@fosteringlinux.com'; // Change this to the official email address
    const officialSubject = 'Incentive Details for ' + getMonthName(currentMonth);
    const officialBody = composeConsolidatedEmailBody(data, currentMonth);

    // Send the consolidated email
    return sendEmail(officialEmail, officialSubject, officialBody);
}

// Function to compose email body for individual emails
function composeEmailBody(employeeName) {
    const htmlTemplate = fs.readFileSync('incentive_template.html', 'utf-8');
    // Customize the HTML template as needed
    return htmlTemplate.replace('{{employeeName}}', employeeName);
}

// Function to compose email body for consolidated email
function composeConsolidatedEmailBody(data, currentMonth) {
    let body = `
        <html>
        <head>
            <style>
                body {
                    font-family: Arial, sans-serif;
                }
                .container {
                    padding: 20px;
                    border-collapse: collapse;
                    border-radius: 10px;
                    box-shadow: 0px 0px 10px rgba(0, 0, 0, 0.1);
                    font-size: 15px;
                }
                h2 {
                    color: #1e88e5;
                    font-size: 24px;
                    margin-bottom: 20px;
                }
                table {
                    border-collapse: collapse;
                    border-radius: 10px;
                    overflow: hidden;
                    background-color: #ffffff;
                    box-shadow: 0px 2px 4px rgba(0, 0, 0, 0.1);
                }
                th, td {
                    padding: 15px;
                    border-right: 1px solid #808080;
                }
                th {
                    background-color: #1e88e5;
                    color: #ffffff;
                }
                tr{
                    border-bottom: 1px solid #808080;
                }
                tr:nth-child(even) {
                    background-color: #f9f9f9;
                }
                tr:last-child {
                    border-bottom: 1px solid #ccc;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <p>Dear All,</p>
                <p>Following are the associates who have qualified for incentives in the month of ${getMonthName(currentMonth)}:</p>
                <h2>Incentive Details for Current Month</h2>
                <table>
                    <thead>
                        <tr>
                            <th style="width: 50px;">S.No.</th>
                            <th>Employee Name</th>
                            <th>Reason</th>
                            <th>Email</th>
                        </tr>
                    </thead>
                    <tbody>
    `;
    for (let i = 0; i < data.length; i++) {
        const srNo = i + 1;
        const employeeName = data[i].Name; // Corrected property name
        const employeeEmail = data[i].Email; // Corrected property name
        const reason = data[i].Reason; // Assuming there's a 'Reason' field in the data
        body += `
            <tr>
                <td>${srNo}</td>
                <td>${employeeName}</td>
                <td>${reason}</td>
                <td>${employeeEmail}</td>
            </tr>
        `;
    }
    body += `
                    </tbody>
                </table>
            </div>
        </body>
        </html>
    `;
    return body;
}

// Function to send email
function sendEmail(to, subject, body) {
    return new Promise((resolve, reject) => {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER, // Access sender ID from environment variable
                pass: process.env.EMAIL_PASS // Access sender password from environment variable
            }
        });

        const mailOptions = {
            from: 'Your Name', // You can customize the sender name here if needed
            to: to,
            subject: subject,
            html: body
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error('Error sending email:', error);
                reject(error);
            } else {
                console.log('Email sent to:', to, info.response);
                resolve();
            }
        });
    });
}

// Helper function to get month name from month number
function getMonthName(monthNumber) {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return months[monthNumber - 1];
}
