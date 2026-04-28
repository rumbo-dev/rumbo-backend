
app.post('/api/emails/process-and-create', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { rawEmail } = req.body
    if (!rawEmail || typeof rawEmail !== 'string') {
      return res.status(400).json({ error: 'Missing rawEmail in body' })
    }
    
    const { processEmailIntake } = await import('./services/EmailIntakeService.js')
    const result = await processEmailIntake(rawEmail, req.userId!)
    
    res.json(result)
  } catch (error: any) {
    console.error('Email intake error:', error.message)
    res.status(500).json({ error: 'Failed to process email', details: error.message })
  }
})

app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
