import { NextResponse } from 'next/server'
import { getPayloadClient } from '@/lib/payload'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const required = ['name', 'email', 'serviceInterest', 'message']
    for (const field of required) {
      if (!body[field]) {
        return NextResponse.json({ error: `${field} is required` }, { status: 400 })
      }
    }

    const payload = await getPayloadClient()
    await payload.create({
      collection: 'contact-submissions',
      data: {
        name: body.name,
        email: body.email,
        phone: body.phone || '',
        company: body.company || '',
        serviceInterest: body.serviceInterest,
        message: body.message,
        status: 'new'
      }
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: 'Unable to submit contact request' }, { status: 500 })
  }
}
