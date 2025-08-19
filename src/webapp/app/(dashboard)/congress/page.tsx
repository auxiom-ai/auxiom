import { getCongressBills } from '@/lib/db/queries';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Calendar, FileText } from 'lucide-react';

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

export default async function CongressPage() {
  const billsByInterest = await getCongressBills();

  // Check if we have any bills across all interests
  const hasAnyBills = billsByInterest && typeof billsByInterest === 'object' && 
    Object.values(billsByInterest).some((bills: any) => Array.isArray(bills) && bills.length > 0);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Congress Bills</h1>
        <p className="text-gray-600">
          Recent congressional bills relevant to your interests, updated weekly.
        </p>
      </div>

      {!hasAnyBills ? (
        <div className="text-center py-12">
          <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No bills found</h3>
          <p className="text-gray-500">
            No congressional bills have been scraped yet. Check back later.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(billsByInterest).map(([interest, bills]: [string, any]) => {
            if (!Array.isArray(bills) || bills.length === 0) return null;
            
            return (
              <div key={interest} className="space-y-4">
                <div className="border-b border-gray-200 pb-2">
                  <h2 className="text-xl font-semibold text-gray-900">{interest}</h2>
                  <p className="text-sm text-gray-600">{bills.length} bill{bills.length !== 1 ? 's' : ''} found</p>
                </div>
                
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {bills.map((bill: CongressBill) => (
                    <Card key={bill.billId} className="hover:shadow-lg transition-shadow">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <CardTitle className="text-lg leading-tight mb-2">
                              {bill.title}
                            </CardTitle>
                            <CardDescription className="flex items-center gap-2">
                              <Badge variant="outline">{bill.billId}</Badge>
                              {bill.similarityScore && (
                                <Badge variant="secondary">
                                  {Math.round(bill.similarityScore * 100)}% match
                                </Badge>
                              )}
                            </CardDescription>
                          </div>
                          {bill.url && (
                            <a
                              href={bill.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                              title="View on Congress.gov"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                        </div>
                      </CardHeader>
                      
                      <CardContent>
                        <div className="space-y-3">
                          {bill.latestActionDate && (
                            <div className="flex items-start gap-2">
                              <Calendar className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                              <div>
                                <div className="text-sm font-medium text-gray-700">
                                  Latest Action ({bill.latestActionDate})
                                </div>
                                {bill.latestActionText && (
                                  <div className="text-sm text-gray-600 mt-1">
                                    {bill.latestActionText}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                          
                          <div className="text-xs text-gray-500 pt-2 border-t">
                            Scraped: {new Date(bill.scrapedAt || Date.now()).toLocaleDateString()}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
