import { json } from '@remix-run/node';
import { authenticate } from '../shopify.server.js';
import { Contact } from '../models/Contact.js';
import { Shop } from '../models/Shop.js';
import nodemailer from 'nodemailer';
import { connectDatabase } from '../utilty/database.js';

// Create email transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_PORT === '465',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export const action = async ({ request }) => {
  try {
    await connectDatabase();
    console.log('Contact API: Authenticating session...');
    const { session } = await authenticate.admin(request);
    if (!session) {
      console.log('Contact API: No session');
      return json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    const formData = await request.formData();
    const name = formData.get('name');
    const email = formData.get('email');
    const code = formData.get('code');
    const password = formData.get('password');
    const reason = formData.get('reason') || 'other';
    const page = formData.get('page');
    const message = formData.get('message');
    const shop = session.shop;
    console.log('Contact API: Form data', { name, email, code, password, reason, page, message, shop });
    if (!name || !email || !code || !message) {
      console.log('Contact API: Missing required fields');
      return json({ success: false, error: 'All fields are required' }, { status: 400 });
    }
    const shopDoc = await Shop.findOne({ shop });
    if (!shopDoc) {
      console.log('Contact API: Shop not found', shop);
      return json({ success: false, error: 'Shop not found' }, { status: 404 });
    }
    try {
      const contact = await Contact.create({
        shopId: shopDoc._id,
        name,
        email,
        code,
        password,
        reason,
        page,
        message,
        status: 'new'
      });
      console.log('Contact API: Contact created', contact._id);
      try {
        await transporter.sendMail({
          from: process.env.SMTP_USER,
          to: process.env.ADMIN_EMAIL,
          subject: `New Contact Form Submission from ${shop}`,
          html: `
            <table width="100%" cellpadding="0" cellspacing="0" background-color: #f9f9f9; padding: 20px;">
  <tr>
    <td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 6px; padding: 30px; box-shadow: 0 0 10px rgba(0,0,0,0.05);">
        <tr>
          <td style="text-align: center; padding-bottom: 20px;">
            <h2 style="margin: 0; color: #333;">📝 New Contact Form Submission</h2>
            <p style="margin: 5px 0; color: #888;">from <strong>test-build-bulk.myshopify.com</strong></p>
          </td>
        </tr>
        <tr>
          <td style="font-size: 15px; color: #333;">
            <p><strong>Shop:</strong> ${shop}</p>
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Code:</strong> ${code}</p>
            ${password ? `<p><strong>Password:</strong> ${password}</p>` : ''}
            ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
            ${page ? `<p><strong>Page:</strong> ${page}</p>` : ''}
            <p><strong>Message:</strong></p>
            <p style="background-color: #f3f3f3; padding: 10px; border-radius: 4px;">${message}</p>
          </td>
        </tr>
        <tr>
          <td style="padding-top: 30px; text-align: center; font-size: 12px; color: #aaa;">
            <p>&copy; ${new Date().getFullYear()} test-build-bulk.myshopify.com</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
          `
        });
        console.log('Contact API: Email sent');
      } catch (emailError) {
        console.log('Contact API: Email failed', emailError);
      }
      return json({ success: true, message: 'Message sent successfully!' });
    } catch (dbError) {
      console.log('Contact API: Contact.create failed', dbError);
      return json({
        success: false,
        error: 'Failed to save your message. Please try again.'
      }, { status: 500 });
    }
  } catch (error) {
    console.log('Contact API: General error', error);
    return json({
      success: false,
      error: 'Failed to process your message. Please try again.'
    }, { status: 500 });
  }
}; 