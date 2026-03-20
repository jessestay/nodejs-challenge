const sgMail = require('@sendgrid/mail');

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

/**
 * Send transactional email via SendGrid.
 * @param {Object} options - { email, templateId, data }
 * @returns {Promise<void>} - Rejects on failure so callers can handle errors.
 */
async function sendEmail(options) {
  if (!process.env.SENDGRID_API_KEY) {
    throw new Error('SendGrid is not configured. Set SENDGRID_API_KEY.');
  }
  const msg = {
    to: options.email,
    from: process.env.SENDGRID_MAIL,
    templateId: options.templateId,
    dynamic_template_data: options.data,
  };
  await sgMail.send(msg);
}

module.exports = sendEmail;
