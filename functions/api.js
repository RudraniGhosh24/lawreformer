//import fetch from "node-fetch";

export async function onRequest(context) {
  try {
    const { request } = context;

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const body = await request.json();
    const question = body.q;  // <-- matches your index.html sending { q: input }

    if (!question) {
      return new Response(JSON.stringify({ error: "Missing 'q' in request body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Step 1: Send question to HF space to get event_id
    const postRes = await fetch(
      "https://rudranighosh-indian-family-law2.hf.space/gradio_api/call/predict",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: [question] }),
      }
    );

    const postData = await postRes.json();
    const eventId = postData.event_id;

    if (!eventId) {
      return new Response(JSON.stringify({ error: "No event_id from HF Space" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Step 2: Poll for answer stream and extract the "complete" event data
    const eventUrl = `https://rudranighosh-indian-family-law2.hf.space/gradio_api/call/predict/${eventId}`;
    const getRes = await fetch(eventUrl);

    const reader = getRes.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let done = false;
    let buffer = "";

    while (!done) {
      const { value, done: doneReading } = await reader.read();
      done = doneReading;
      if (value) {
        buffer += decoder.decode(value, { stream: !done });

        const match = buffer.match(/event: complete\s+data: (.+)/);
        if (match && match[1]) {
          try {
            const dataArray = JSON.parse(match[1]);
            if (Array.isArray(dataArray) && dataArray.length > 0) {
              const answer = dataArray[0];
              return new Response(JSON.stringify({ answer }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              });
            }
          } catch {
            // ignore parse errors and keep reading
          }
        }
      }
    }

    return new Response(JSON.stringify({ error: "No answer received" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
