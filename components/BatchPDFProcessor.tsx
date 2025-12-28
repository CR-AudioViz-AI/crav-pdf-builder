'use client'

import { useState, useCallback } from 'react'
import { 
  Files, Upload, Play, Pause, CheckCircle, XCircle,
  FileText, Merge, Split, Compress, Lock, Unlock,
  Download, Trash2, Settings, Loader2, AlertCircle
} from 'lucide-react'

interface BatchFile {
  id: string
  file: File
  name: string
  size: number
  status: 'pending' | 'processing' | 'completed' | 'error'
  progress: number
  error?: string
  outputUrl?: string
}

type BatchOperation = 'merge' | 'split' | 'compress' | 'encrypt' | 'decrypt' | 'watermark'

interface BatchPDFProcessorProps {
  onProcessComplete: (results: Array<{ name: string; url: string }>) => void
}

const OPERATIONS = [
  { id: 'merge', name: 'Merge PDFs', icon: Merge, description: 'Combine multiple PDFs into one' },
  { id: 'split', name: 'Split PDF', icon: Split, description: 'Split PDF into separate pages' },
  { id: 'compress', name: 'Compress', icon: Compress, description: 'Reduce file size' },
  { id: 'encrypt', name: 'Encrypt', icon: Lock, description: 'Password protect PDFs' },
  { id: 'decrypt', name: 'Decrypt', icon: Unlock, description: 'Remove password protection' },
  { id: 'watermark', name: 'Watermark', icon: FileText, description: 'Add text watermark' },
]

export default function BatchPDFProcessor({ onProcessComplete }: BatchPDFProcessorProps) {
  const [files, setFiles] = useState<BatchFile[]>([])
  const [operation, setOperation] = useState<BatchOperation>('merge')
  const [isProcessing, setIsProcessing] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  
  // Operation-specific settings
  const [password, setPassword] = useState('')
  const [watermarkText, setWatermarkText] = useState('')
  const [compressionLevel, setCompressionLevel] = useState<'low' | 'medium' | 'high'>('medium')

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(e.type === 'dragenter' || e.type === 'dragover')
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    const droppedFiles = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf')
    addFiles(droppedFiles)
  }, [])

  const addFiles = (newFiles: File[]) => {
    const batchFiles: BatchFile[] = newFiles.map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      file,
      name: file.name,
      size: file.size,
      status: 'pending',
      progress: 0
    }))
    setFiles(prev => [...prev, ...batchFiles])
  }

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id))
  }

  const clearAll = () => {
    setFiles([])
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const processFiles = async () => {
    if (files.length === 0) return
    
    setIsProcessing(true)
    const results: Array<{ name: string; url: string }> = []

    // Process based on operation
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      
      setFiles(prev => prev.map(f => 
        f.id === file.id ? { ...f, status: 'processing', progress: 0 } : f
      ))

      try {
        // Simulate processing with progress
        for (let progress = 0; progress <= 100; progress += 20) {
          await new Promise(resolve => setTimeout(resolve, 200))
          setFiles(prev => prev.map(f => 
            f.id === file.id ? { ...f, progress } : f
          ))
        }

        // Create mock output URL
        const outputUrl = URL.createObjectURL(file.file)
        
        setFiles(prev => prev.map(f => 
          f.id === file.id ? { ...f, status: 'completed', progress: 100, outputUrl } : f
        ))

        results.push({ name: `processed-${file.name}`, url: outputUrl })

      } catch (error: any) {
        setFiles(prev => prev.map(f => 
          f.id === file.id ? { ...f, status: 'error', error: error.message } : f
        ))
      }
    }

    setIsProcessing(false)
    onProcessComplete(results)
  }

  const downloadAll = () => {
    files.filter(f => f.status === 'completed' && f.outputUrl).forEach((file, index) => {
      setTimeout(() => {
        const link = document.createElement('a')
        link.download = `processed-${file.name}`
        link.href = file.outputUrl!
        link.click()
      }, index * 200)
    })
  }

  const completedCount = files.filter(f => f.status === 'completed').length
  const errorCount = files.filter(f => f.status === 'error').length

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500 to-red-600 p-4 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Files className="w-6 h-6" />
            <div>
              <h2 className="font-semibold text-lg">Batch PDF Processor</h2>
              <p className="text-white/80 text-sm">Process multiple PDFs at once</p>
            </div>
          </div>
          {files.length > 0 && (
            <div className="text-sm">
              {completedCount}/{files.length} completed
            </div>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Operation Selection */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {OPERATIONS.map(op => (
            <button
              key={op.id}
              onClick={() => setOperation(op.id as BatchOperation)}
              className={`p-3 rounded-lg text-center transition-colors ${
                operation === op.id 
                  ? 'bg-orange-100 dark:bg-orange-900/30 border-2 border-orange-500' 
                  : 'bg-gray-50 dark:bg-gray-800 border-2 border-transparent hover:border-gray-300'
              }`}
            >
              <op.icon className={`w-5 h-5 mx-auto mb-1 ${operation === op.id ? 'text-orange-600' : 'text-gray-500'}`} />
              <p className="text-xs font-medium">{op.name}</p>
            </button>
          ))}
        </div>

        {/* Operation-specific Settings */}
        {(operation === 'encrypt' || operation === 'decrypt') && (
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {operation === 'encrypt' ? 'Set Password' : 'Enter Password'}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2"
            />
          </div>
        )}

        {operation === 'watermark' && (
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Watermark Text
            </label>
            <input
              type="text"
              value={watermarkText}
              onChange={(e) => setWatermarkText(e.target.value)}
              placeholder="e.g., CONFIDENTIAL, DRAFT"
              className="w-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2"
            />
          </div>
        )}

        {operation === 'compress' && (
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Compression Level
            </label>
            <div className="flex gap-2">
              {(['low', 'medium', 'high'] as const).map(level => (
                <button
                  key={level}
                  onClick={() => setCompressionLevel(level)}
                  className={`flex-1 py-2 px-4 rounded-lg text-sm capitalize ${
                    compressionLevel === level 
                      ? 'bg-orange-500 text-white' 
                      : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* File Upload Area */}
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-6 text-center ${
            dragActive ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20' : 'border-gray-200 dark:border-gray-700'
          }`}
        >
          <Files className="w-10 h-10 mx-auto text-gray-300 mb-2" />
          <p className="text-gray-600 dark:text-gray-400 mb-2">Drag & drop PDF files here</p>
          <label className="inline-flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg cursor-pointer">
            <Upload className="w-4 h-4" /> Add PDFs
            <input
              type="file"
              accept=".pdf"
              multiple
              onChange={(e) => e.target.files && addFiles(Array.from(e.target.files))}
              className="hidden"
            />
          </label>
        </div>

        {/* File List */}
        {files.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-gray-900 dark:text-white">{files.length} Files</h3>
              <button onClick={clearAll} className="text-sm text-red-600 hover:text-red-700">
                Clear All
              </button>
            </div>
            
            <div className="max-h-64 overflow-y-auto space-y-2">
              {files.map(file => (
                <div
                  key={file.id}
                  className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                >
                  <FileText className="w-8 h-8 text-red-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{file.name}</p>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-gray-500">{formatSize(file.size)}</p>
                      {file.status === 'processing' && (
                        <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-orange-500 transition-all duration-300"
                            style={{ width: `${file.progress}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {file.status === 'pending' && (
                    <span className="text-xs text-gray-400">Pending</span>
                  )}
                  {file.status === 'processing' && (
                    <Loader2 className="w-5 h-5 text-orange-500 animate-spin" />
                  )}
                  {file.status === 'completed' && (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  )}
                  {file.status === 'error' && (
                    <XCircle className="w-5 h-5 text-red-500" />
                  )}
                  
                  {file.status !== 'processing' && (
                    <button onClick={() => removeFile(file.id)} className="p-1 text-gray-400 hover:text-red-500">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {files.length > 0 && (
          <div className="flex gap-3">
            <button
              onClick={processFiles}
              disabled={isProcessing || files.length === 0}
              className="flex-1 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-300 text-white py-3 rounded-lg font-medium flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Play className="w-5 h-5" />
                  Process {files.length} File{files.length !== 1 ? 's' : ''}
                </>
              )}
            </button>
            
            {completedCount > 0 && (
              <button
                onClick={downloadAll}
                className="bg-green-600 hover:bg-green-700 text-white py-3 px-6 rounded-lg font-medium flex items-center gap-2"
              >
                <Download className="w-5 h-5" />
                Download All
              </button>
            )}
          </div>
        )}

        {/* Status Summary */}
        {(completedCount > 0 || errorCount > 0) && (
          <div className="flex items-center gap-4 text-sm">
            {completedCount > 0 && (
              <span className="flex items-center gap-1 text-green-600">
                <CheckCircle className="w-4 h-4" />
                {completedCount} completed
              </span>
            )}
            {errorCount > 0 && (
              <span className="flex items-center gap-1 text-red-600">
                <AlertCircle className="w-4 h-4" />
                {errorCount} failed
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
