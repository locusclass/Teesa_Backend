import { env } from '../config/env'

export interface SmsProvider {
  sendSms(to: string, message: string): Promise<boolean>
}

class AfricasTalkingProvider implements SmsProvider {
  private username: string
  private apiKey: string
  private senderId: string

  constructor() {
    this.username = env.AT_USERNAME || 'sandbox'
    this.apiKey = env.AT_API_KEY || ''
    this.senderId = env.AT_SENDER_ID || 'TEESA'
  }

  async sendSms(to: string, message: string): Promise<boolean> {
    try {
      const response = await fetch('https://api.africastalking.com/version1/messaging', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          apiKey: this.apiKey,
        },
        body: new URLSearchParams({
          username: this.username,
          to,
          message,
          from: this.senderId,
        }),
      })
      const data = await response.json() as { SMSMessageData?: { Recipients?: Array<{ status: string }> } }
      return data.SMSMessageData?.Recipients?.[0]?.status === 'Success'
    } catch (err) {
      console.error('Africa\'s Talking SMS error:', err)
      return false
    }
  }
}

class MockSmsProvider implements SmsProvider {
  async sendSms(to: string, message: string): Promise<boolean> {
    console.log(`[MockSMS] To: ${to} | Message: ${message}`)
    return true
  }
}

export function getSmsProvider(): SmsProvider {
  if (env.SMS_PROVIDER === 'africas_talking' && env.AT_API_KEY) {
    return new AfricasTalkingProvider()
  }
  return new MockSmsProvider()
}

export async function sendOtpSms(phone: string, code: string): Promise<boolean> {
  const sms = getSmsProvider()
  return sms.sendSms(phone, `Your Teesa OTP is: ${code}. Valid for ${env.OTP_EXPIRY_MINUTES} minutes. Do not share.`)
}

export async function sendBookingNotificationSms(phone: string, message: string): Promise<boolean> {
  const sms = getSmsProvider()
  return sms.sendSms(phone, `Teesa: ${message}`)
}
