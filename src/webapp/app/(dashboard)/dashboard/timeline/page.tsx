import { getLatestTimelineFile } from '@/lib/db/queries';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Calendar, FileText, Database, Clock, HardDrive } from 'lucide-react';

interface TimelineBill {
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

interface TimelineFile {
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

export default async function TimelinePage() {
  const timelineFile = await getLatestTimelineFile() as TimelineFile | null;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Timeline</h1>
        <p className="text-gray-600">
          Latest congressional bills data with metadata from the most recent scrape.
        </p>
      </div>

      {!timelineFile ? (
        <div className="text-center py-12">
          <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No timeline data found</h3>
          <p className="text-gray-500">
            No congressional bills have been scraped yet. Check back later.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <Clock className="h-8 w-8 text-blue-600" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Last Updated</p>
                    <p className="text-lg font-bold text-gray-900">
                      {timelineFile.lastModified ? new Date(timelineFile.lastModified).toLocaleDateString() : 'Unknown'}
                    </p>
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
                      {timelineFile.totalBills}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Bill Data */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-gray-900">Congressional Bills</h2>
            
            <Card className="hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="space-y-3">
                  
                  {timelineFile.error ? (
                    <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
                      Error: {timelineFile.error}
                    </div>
                  ) : timelineFile.bills && typeof timelineFile.bills === 'object' ? (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <span className="text-sm font-medium text-gray-700">Bills by Interest:</span>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(timelineFile.bills).map(([interest, bills]: [string, any]) => (
                            <Badge key={interest} variant="outline" className="text-xs">
                              {interest}: {Array.isArray(bills) ? bills.length : 0}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      
                      {/* Display actual bill details */}
                      <div className="space-y-3">
                        <span className="text-sm font-medium text-gray-700">Bill Details:</span>
                        <div className="space-y-3 max-h-96 overflow-y-auto">
                          {Object.entries(timelineFile.bills).map(([interest, bills]: [string, any]) => 
                            Array.isArray(bills) && bills.length > 0 ? (
                              <div key={interest} className="space-y-2">
                                <h4 className="text-sm font-semibold text-gray-800 capitalize">{interest}</h4>
                                <div className="space-y-2 pl-4">
                                  {bills.slice(0, 3).map((bill: any, index: number) => (
                                    <div key={index} className="bg-gray-50 p-4 rounded-lg text-sm space-y-2">
                                      <div className="font-medium text-gray-900 mb-2">
                                        {bill.billType && bill.billNumber && bill.congress ? 
                                          `${bill.billType}-${bill.billNumber} (${bill.congress}th Congress)` :
                                          'Bill Information'
                                        }
                                      </div>
                                      
                                      <div className="space-y-1">
                                        {/* Display all available fields from the bill object */}
                                        {Object.entries(bill).map(([key, value]: [string, any]) => {
                                          if (!value || value === '' || value === null || value === undefined) return null;
                                          
                                          // Format the key name for display
                                          const displayKey = key.replace(/([A-Z])/g, ' $1')
                                            .replace(/^./, str => str.toUpperCase())
                                            .trim();
                                          
                                          // Handle different value types
                                          let displayValue = value;
                                          
                                          // Format dates
                                          if (key.toLowerCase().includes('date') || key === 'scrapedAt') {
                                            try {
                                              displayValue = new Date(value).toLocaleString();
                                            } catch (e) {
                                              displayValue = value;
                                            }
                                          }
                                          
                                          // Format similarity score as percentage
                                          if (key === 'similarityScore' && typeof value === 'number') {
                                            displayValue = `${(value * 100).toFixed(1)}%`;
                                          }
                                          
                                          // Handle URLs specially
                                          if (key === 'url' && value) {
                                            return (
                                              <div key={key} className="pt-2">
                                                <a 
                                                  href={value} 
                                                  target="_blank" 
                                                  rel="noopener noreferrer"
                                                  className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs"
                                                >
                                                  <ExternalLink className="h-3 w-3" />
                                                  View Full Bill
                                                </a>
                                              </div>
                                            );
                                          }
                                          
                                          return (
                                            <div key={key}>
                                              <span className="font-medium text-gray-700">{displayKey}:</span> {displayValue}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  ))}
                                  {bills.length > 3 && (
                                    <div className="text-xs text-gray-500 text-center py-2">
                                      ... and {bills.length - 3} more bills in {interest}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ) : null
                          )}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
