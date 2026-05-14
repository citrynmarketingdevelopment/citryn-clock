import { SendLayer } from "sendlayer";

const SENDLAYER_API_KEY = process.env.SENDLAYER_API_KEY;
const SENDLAYER_FROM_EMAIL = process.env.SENDLAYER_FROM_EMAIL || process.env.ADMIN_EMAIL;
const SENDLAYER_FROM_NAME = process.env.SENDLAYER_FROM_NAME || "Citryn";

let cachedClient = null;

function getClient() {
  if (!SENDLAYER_API_KEY) {
    throw new Error("SENDLAYER_NOT_CONFIGURED");
  }
  if (!cachedClient) {
    cachedClient = new SendLayer(SENDLAYER_API_KEY);
  }
  return cachedClient;
}

export function isSendLayerConfigured() {
  return Boolean(SENDLAYER_API_KEY && SENDLAYER_FROM_EMAIL);
}

export async function sendKitchenReviewEmail({ toEmail, videoTitle, reviewUrl }) {
  if (!SENDLAYER_FROM_EMAIL) {
    throw new Error("SENDLAYER_FROM_NOT_CONFIGURED");
  }

  const client = getClient();
  const subject = `Video review request: ${videoTitle}`;
  const text = [
    "Hi,",
    "",
    "Please review this video and leave timestamped comments at the link below:",
    reviewUrl,
    "",
    "Thanks,",
    SENDLAYER_FROM_NAME,
  ].join("\n");

  const html = `
    <html>
      <body>
        <p>Hi,</p>
        <p>Please review this video and leave timestamped comments at the link below:</p>
        <p><a href="${reviewUrl}">${reviewUrl}</a></p>
        <p>Thanks,<br/>${SENDLAYER_FROM_NAME}</p>
      </body>
    </html>
  `;

  return client.Emails.send({
    from: {
      name: SENDLAYER_FROM_NAME,
      email: SENDLAYER_FROM_EMAIL,
    },
    to: toEmail,
    subject,
    text,
    html,
  });
}
