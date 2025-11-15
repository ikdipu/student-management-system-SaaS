import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";

export async function PATCH(req, context){
	const {slug: slugId} = await context.params;
	const {id:bodyId, months} = await req.json();

    console.log(bodyId);
    console.log(months);

    if(!bodyId || !months || !Array.isArray(months)){
    	return NextResponse.json(
	      { error: "Student ID and months array are required" },
	      { status: 400 }
	    );
    }
    //for database queries
    const studentId = bodyId;

    let objid;
    try{
    	objid = new ObjectId(studentId);
    } catch{
    	return NextResponse.json({ error: "Invalid Student ID" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db(process.env.MONGODB_DB);
    const updated = await db.collection("students").findOneAndUpdate(
    	{ _id: objid },
    	{ $pull: {due_months: { $in: months }} },
    	{ returnDocument: "after"}
    );

    // double check 
    if (!updated) {
	    return NextResponse.json({ error: "Student not found" }, { status: 404 });
	  }

	return NextResponse.json(updated)
}
