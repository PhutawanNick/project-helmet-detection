"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertTriangle, BikeIcon, Camera, Car, CheckCircle, Clock, Eye, EyeOff, Users } from "lucide-react"
import { useCallback, useEffect, useState } from "react"

interface DetectionResult {
  id: string
  timestamp: string
  camera: string
  licensePlate: string
  helmetStatus: "wearing" | "not-wearing"
  passengerCount: number
  confidence: number
  imageUrl?: string
}

interface ApiResponse {
  success: boolean
  analysis: {
    helmet_status: boolean
    passenger_count: number
    violations: string
  }
  image_info: {
    filename: string
    timestamp: string
    file_size: number
  }
  analysis_timestamp: string
}

// Transform API response to DetectionResult
const transformApiResponse = (apiData: ApiResponse): DetectionResult => {
  return {
    id: Date.now().toString(), // Use timestamp as unique ID
    timestamp: apiData.image_info.timestamp.split(' ')[1], // extract time part from timestamp
    camera: "กล้องหลัก - ประตูทางเข้า", // mock camera name
    licensePlate: "กข-1234", // mock license plate
    helmetStatus: apiData.analysis.helmet_status ? "wearing" : "not-wearing",
    passengerCount: apiData.analysis.passenger_count,
    confidence: 95, // removed as requested
    imageUrl: apiData.image_info.filename
  }
}

// Fallback mock data for when backend is not available
const createMockDetection = (): DetectionResult => {
  const mockData = [
    { helmet: false, passengers: 2, plate: "กข-1234" },
    { helmet: true, passengers: 1, plate: "คง-5678" },
    { helmet: false, passengers: 3, plate: "นม-9012" },
  ]
  
  const randomData = mockData[Math.floor(Math.random() * mockData.length)]
  
  return {
    id: Date.now().toString(),
    timestamp: new Date().toLocaleTimeString("th-TH", { hour12: false }),
    camera: "กล้องหลัก - ประตูทางเข้า",
    licensePlate: randomData.plate,
    helmetStatus: randomData.helmet ? "wearing" : "not-wearing",
    passengerCount: randomData.passengers,
    confidence: Math.floor(Math.random() * 10) + 90, // 90-99%
    imageUrl: "mock_snapshot.jpg"
  }
}

export function RealTimeMonitoring() {
  const [detections, setDetections] = useState<DetectionResult[]>([])
  const [isRecording, setIsRecording] = useState(true)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [useMockData, setUseMockData] = useState(false)

  // Fetch helmet detection data from API
  const fetchDetectionData = useCallback(async (abortController?: AbortController) => {
    setLoading(true)
    setError(null)
    
    try {
      const base = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
      
      // Use provided controller or create new one
      const controller = abortController || new AbortController()
      let timeoutId: NodeJS.Timeout | undefined
      
      // Only set timeout if we created the controller
      if (!abortController) {
        timeoutId = setTimeout(() => {
          controller.abort()
        }, 10000) // 10 second timeout
      }
      
      const response = await fetch(`${base}/analysis/helmet`, {
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
        },
      })
      
      // Clear timeout if we set it
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const apiData: ApiResponse = await response.json()
      
      if (apiData.success) {
        const newDetection = transformApiResponse(apiData)
        setDetections(prev => [newDetection, ...prev.slice(0, 9)]) // Keep last 10 detections
        
        // Reset mock data flag on successful fetch
        if (useMockData) {
          setUseMockData(false)
        }
      } else {
        throw new Error('API returned success: false')
      }
    } catch (error) {
      // Only handle error if it's not an abort from component cleanup
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Request aborted:', abortController ? 'Component cleanup' : 'Timeout')
        
        // Check if this is a timeout or component unmount
        if (!abortController) {
          setError('Request timeout - Using mock data')
        }
        // Don't set error for component unmount (when abortController is provided)
        return
      }
      
      console.error('Error fetching detection data:', error)
      
      // Use mock data as fallback if backend is not available
      if (!useMockData) {
        const mockDetection = createMockDetection()
        setDetections(prev => [mockDetection, ...prev.slice(0, 9)])
        setUseMockData(true)
      }
      
      if (error instanceof Error) {
        if (error.message.includes('fetch')) {
          setError('Backend unavailable - Using mock data')
        } else {
          setError(`${error.message} - Using mock data`)
        }
      } else {
        setError('Unknown error - Using mock data')
      }
    } finally {
      setLoading(false)
    }
  }, [useMockData]) // Dependencies for useCallback

  // Update current time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  // Fetch detection data periodically when recording
  useEffect(() => {
    if (!isRecording) return

    // Create abort controller for this effect
    const abortController = new AbortController()
    
    // Fetch immediately when starting
    fetchDetectionData(abortController)

    // Then fetch every 3 seconds
    const interval = setInterval(() => {
      if (!abortController.signal.aborted) {
        fetchDetectionData(abortController)
      }
    }, 3000)

    // Cleanup function
    return () => {
      clearInterval(interval)
      abortController.abort() // Cancel any ongoing requests
    }
  }, [isRecording, useMockData]) // Add useMockData to dependencies

  // Show MJPEG stream by setting the image src
  const [mjpegUrl, setMjpegUrl] = useState<string | undefined>(undefined)

  useEffect(() => {
    // Set MJPEG stream URL for video display only
    const base = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
    const streamUrl = `${base}/helmet/detect`
    console.log('MJPEG Stream URL:', streamUrl)
    
    // Only set stream URL when recording, independent of data fetching
    if (isRecording) {
      setMjpegUrl(streamUrl)
    } else {
      setMjpegUrl(undefined)
    }
  }, [isRecording])

  const todayViolations = detections.filter((d) => d.helmetStatus === "not-wearing").length
  const todayTotal = detections.length
  const complianceRate = todayTotal > 0 ? Math.round(((todayTotal - todayViolations) / todayTotal) * 100) : 0

  return (
    <div className="space-y-6">
      {/* Header with Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">การตรวจสอบแบบ Real-time</h2>
          <p className="text-muted-foreground">อัปเดตล่าสุด: {currentTime.toLocaleTimeString("th-TH")}</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full animate-pulse ${useMockData ? 'bg-yellow-500' : 'bg-green-500'}`}></div>
            <span className="text-sm text-muted-foreground">
              สถานะ: {useMockData ? 'ใช้ข้อมูลจำลอง' : 'เชื่อมต่อแล้ว'}
            </span>
          </div>

          <Button
            variant={isRecording ? "destructive" : "default"}
            size="sm"
            onClick={() => setIsRecording(!isRecording)}
            className="gap-2"
          >
            {isRecording ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {isRecording ? "หยุดบันทึก" : "เริ่มบันทึก"}
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">การกระทำผิดวันนี้</p>
                <p className="text-2xl font-bold text-foreground">{todayViolations}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">อัตราการปฏิบัติตาม</p>
                <p className="text-2xl font-bold text-foreground">{complianceRate}%</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <BikeIcon className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">มอเตอร์ไซค์ที่ตรวจพบ</p>
                <p className="text-2xl font-bold text-foreground">{todayTotal}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                <Users className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">นั่งเกิน 2 คน</p>
                <p className="text-2xl font-bold text-foreground">
                  {detections.filter((d) => d.passengerCount > 2).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Video Feeds */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Camera className="h-5 w-5" />
              กล้องหลัก - ตรวจจับผู้ขับขี่
              <Badge variant="secondary" className="ml-auto">
                Live
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="aspect-video bg-muted rounded-lg flex items-center justify-center relative overflow-hidden">
              {mjpegUrl ? (
                <img id="mjpeg-stream" src={mjpegUrl} alt="Live MJPEG" className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <div className="relative z-10 text-center">
                  <Camera className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                  <span className="text-muted-foreground">Live Video Feed</span>
                </div>
              )}
              <div className="absolute top-3 right-3 flex items-center gap-1 bg-red-500 text-white px-2 py-1 rounded text-xs">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                REC
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Camera className="h-5 w-5" />
              กล้องรอง - ตรวจจับป้ายทะเบียน
              <Badge variant="secondary" className="ml-auto">
                Live
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="aspect-video bg-muted rounded-lg flex items-center justify-center relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-green-500/20 to-blue-500/20"></div>
              <div className="relative z-10 text-center">
                <Camera className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                <span className="text-muted-foreground">Live Video Feed</span>
              </div>
              <div className="absolute top-3 right-3 flex items-center gap-1 bg-red-500 text-white px-2 py-1 rounded text-xs">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                REC
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detection Results */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            ผลการตรวจจับล่าสุด
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {detections.map((detection) => (
              <div
                key={detection.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-muted rounded-lg gap-3"
              >
                <div className="flex items-center gap-4">
                  <div className="text-sm text-muted-foreground min-w-[70px]">{detection.timestamp}</div>

                  <div className="flex items-center gap-2">
                    {detection.helmetStatus === "wearing" ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                    )}
                    <span
                      className={`text-sm font-medium ${detection.helmetStatus === "wearing" ? "text-green-600" : "text-red-600"
                        }`}
                    >
                      {detection.helmetStatus === "wearing" ? "สวมหมวกกันน็อค" : "ไม่สวมหมวกกันน็อค"}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <div className="flex items-center gap-1">
                    <Car className="h-4 w-4 text-muted-foreground" />
                    <span className="font-mono">{detection.licensePlate}</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span>{detection.passengerCount} คน</span>
                    {detection.passengerCount > 2 && (
                      <Badge variant="destructive" className="ml-1 text-xs">
                        เกินกำหนด
                      </Badge>
                    )}
                  </div>

                  <Badge variant="outline" className="text-xs">
                    {detection.confidence}% แม่นยำ
                  </Badge>

                  <span className="text-xs text-muted-foreground">{detection.camera}</span>
                </div>
              </div>
            ))}

            {loading && (
              <div className="text-center py-8 text-muted-foreground">
                <div className="animate-spin h-8 w-8 border-b-2 border-primary mx-auto mb-3"></div>
                <p>กำลังโหลดข้อมูล...</p>
              </div>
            )}

            {error && (
              <div className="text-center py-8 text-yellow-600">
                <AlertTriangle className="h-12 w-12 mx-auto mb-3" />
                <p>{error}</p>
                <div className="flex gap-2 justify-center mt-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => {
                      setUseMockData(false)
                      setError(null)
                      // Create new abort controller for manual retry
                      const retryController = new AbortController()
                      fetchDetectionData(retryController)
                    }}
                  >
                    ลองเชื่อมต่อจริงอีกครั้ง
                  </Button>
                  {useMockData && (
                    <Button 
                      variant="secondary" 
                      size="sm" 
                      onClick={() => {
                        const mockDetection = createMockDetection()
                        setDetections(prev => [mockDetection, ...prev.slice(0, 9)])
                      }}
                    >
                      เพิ่มข้อมูลจำลอง
                    </Button>
                  )}
                </div>
              </div>
            )}

            {!loading && !error && detections.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Camera className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>ไม่มีการตรวจจับในขณะนี้</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
