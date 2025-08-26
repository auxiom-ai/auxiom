import { getCongressBills } from '@/lib/db/queries';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Calendar, FileText, Database, Clock, HardDrive } from 'lucide-react';

interface CongressBill {
  billId: string;
  title: string;
  url?: string;
  latestActionDate?: string;
  latestActionText?: string;
  congress?: number;
  billType?: string;
  billNumber?: number;
  keyword?: string;
  similarityScore?: number;
  scrapedAt: string;
}

interface CongressFile {
  fileName: string;
  fullPath: string;
  lastModified?: Date;
  size: number;
  totalBills: number;
  bills: any;
  error?: string;
  metadata: {
    etag?: string;
    storageClass?: string;
  };
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default async function CongressPage() {
  const congressFiles = await getCongressBills() as CongressFile[];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Congress Bills Archive</h1>
        <p className="text-gray-600">
          All congressional bills data stored in the S3 congress section with metadata.
        </p>
      </div>

      {congressFiles.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No congress files found</h3>
          <p className="text-gray-500">
            No congressional bills have been scraped yet. Check back later.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <Database className="h-8 w-8 text-blue-600" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Total Files</p>
                    <p className="text-2xl font-bold text-gray-900">{congressFiles.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <FileText className="h-8 w-8 text-green-600" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Total Bills</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {congressFiles.reduce((sum, file) => sum + file.totalBills, 0)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <HardDrive className="h-8 w-8 text-purple-600" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Total Size</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {formatFileSize(congressFiles.reduce((sum, file) => sum + file.size, 0))}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Files List */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-gray-900">Congress Files</h2>
            
            <div className="grid gap-4">
              {congressFiles.map((file, index) => (
                <Card key={file.fullPath} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg leading-tight mb-2 flex items-center gap-2">
                          <FileText className="h-5 w-5 text-blue-600" />
                          {file.fileName}
                          {index === 0 && (
                            <Badge variant="secondary">Latest</Badge>
                          )}
                        </CardTitle>
                        <CardDescription className="flex items-center gap-4 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {file.lastModified ? new Date(file.lastModified).toLocaleString() : 'Unknown'}
                          </span>
                          <span className="flex items-center gap-1">
                            <HardDrive className="h-4 w-4" />
                            {formatFileSize(file.size)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Database className="h-4 w-4" />
                            {file.totalBills} bills
                          </span>
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-700">Full Path:</span>
                        <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                          s3://905418457861-astra-bucket/{file.fullPath}
                        </code>
                      </div>
                      
                      {file.error ? (
                        <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
                          Error: {file.error}
                        </div>
                      ) : file.bills && typeof file.bills === 'object' ? (
                        <div className="space-y-2">
                          <span className="text-sm font-medium text-gray-700">Bills by Interest:</span>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(file.bills).map(([interest, bills]: [string, any]) => (
                              <Badge key={interest} variant="outline" className="text-xs">
                                {interest}: {Array.isArray(bills) ? bills.length : 0}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      
                      {file.metadata.etag && (
                        <div className="text-xs text-gray-500 pt-2 border-t">
                          ETag: {file.metadata.etag?.replace(/"/g, '')} | 
                          Storage: {file.metadata.storageClass || 'STANDARD'}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
