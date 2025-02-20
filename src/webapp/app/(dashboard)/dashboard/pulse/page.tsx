
import { getKeywords, getDay, getDeliveryStatus, getAccountStatus } from "@/lib/actions";
import { getUser } from "@/lib/db/queries";
import { redirect } from "next/navigation";
import PulsePage from "./pulse";

export default async function Page() {

  const currentKeywords: string[] = await getKeywords();
  const currentDay: number = await getDay();
  const delivered: boolean = await getDeliveryStatus();
  const isActive: boolean = await getAccountStatus();

  const user = await getUser();
    if (!user) {
      redirect('/sign-in');
    }

    if (!user.verified) {
      
      redirect('/sign-in');
    }

    if (!isActive && currentKeywords.length === 0) {
      redirect('/identity');
    } 

    return (
      <div>
        <PulsePage keywords = {currentKeywords} day = {currentDay} deliveryStatus = {delivered} accountStatus = {isActive}/>
      </div>
    );
}
