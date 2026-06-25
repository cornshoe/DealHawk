from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, UploadFile
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import json
import re
import uuid
import bcrypt
import jwt as pyjwt
import httpx
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Literal
from datetime import datetime, timezone, timedelta
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# ---------- Config ----------
MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
JWT_SECRET = os.environ.get('JWT_SECRET', 'dev_secret')
JWT_ALGO = 'HS256'
JWT_EXP_DAYS = 7
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
PUSH_BASE_URL = "https://integrations.emergentagent.com"
PUSH_KEY = os.environ.get('EMERGENT_PUSH_KEY', 'placeholder')

# ---------- DB ----------
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# ---------- Logging ----------
logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("dealhawk")

# ---------- App / Router ----------
app = FastAPI(title="DealHawk AI")
api = APIRouter(prefix="/api")

# Shared push relay client
_push_client = httpx.AsyncClient(
    base_url=PUSH_BASE_URL,
    headers={"X-Push-Key": PUSH_KEY},
    timeout=10.0,
)

# ---------- Models ----------
class SignupBody(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None

class LoginBody(BaseModel):
    email: EmailStr
    password: str

class GoogleSessionBody(BaseModel):
    session_token: str  # token returned by Emergent auth/session-data

class UserOut(BaseModel):
    user_id: str
    email: str
    name: Optional[str] = None
    picture: Optional[str] = None
    created_at: datetime

class AuthResponse(BaseModel):
    token: str
    user: UserOut

class RegisterPushBody(BaseModel):
    user_id: str
    platform: str
    device_token: str

class MarketData(BaseModel):
    buyer_demand: str = ""
    seller_competition: str = ""
    local_price_range: str = ""
    notes: str = ""

class DealAnalysisResult(BaseModel):
    deal_score: int
    inferred_title: Optional[str] = None
    inferred_category: Optional[str] = None
    inferred_location: Optional[str] = None
    inferred_seller_description: Optional[str] = None
    inferred_price: Optional[float] = None
    estimated_resale_value: float
    max_price_to_pay: float
    expected_profit: float
    risk_warning: str
    red_flags: List[str]
    suggested_negotiation_message: str
    recommendation: Literal["buy", "negotiate", "watch", "skip"]
    reasoning: Optional[str] = None
    market_data: Optional[MarketData] = None

class AnalyzeBody(BaseModel):
    title: Optional[str] = ""
    price: Optional[float] = None
    location: Optional[str] = ""
    category: Optional[str] = ""
    condition: Optional[str] = ""
    seller_description: Optional[str] = ""
    notes: Optional[str] = ""
    # list of base64 images (data URL or raw base64 without prefix); mime jpeg/png
    images: List[str] = Field(default_factory=list)

class PricePoint(BaseModel):
    price: float
    at: datetime

class Deal(BaseModel):
    deal_id: str
    user_id: str
    title: str
    price: float
    location: str = ""
    category: str = "other"
    condition: str = ""
    seller_description: str = ""
    notes: str = ""
    listing_url: str = ""
    images: List[str] = Field(default_factory=list)
    status: Literal["new", "watching", "messaged", "purchased", "sold", "skipped"] = "new"
    analysis: Optional[DealAnalysisResult] = None
    last_checked_at: Optional[datetime] = None
    price_history: List[PricePoint] = Field(default_factory=list)
    inferred_fields: List[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

class SaveDealBody(BaseModel):
    title: Optional[str] = ""
    price: float
    location: Optional[str] = ""
    category: str = "other"
    condition: Optional[str] = ""
    seller_description: Optional[str] = ""
    notes: Optional[str] = ""
    listing_url: Optional[str] = ""
    images: List[str] = Field(default_factory=list)
    analysis: Optional[DealAnalysisResult] = None
    status: Optional[Literal["new", "watching", "messaged", "purchased", "sold", "skipped"]] = "new"

class UpdateDealBody(BaseModel):
    status: Optional[Literal["new", "watching", "messaged", "purchased", "sold", "skipped"]] = None
    notes: Optional[str] = None
    price: Optional[float] = None
    listing_url: Optional[str] = None
    mark_checked: Optional[bool] = None

# ---------- Helpers ----------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)

def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False

def make_jwt(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "iat": int(now_utc().timestamp()),
        "exp": int((now_utc() + timedelta(days=JWT_EXP_DAYS)).timestamp()),
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

def user_to_out(u: dict) -> UserOut:
    return UserOut(
        user_id=u["user_id"],
        email=u["email"],
        name=u.get("name"),
        picture=u.get("picture"),
        created_at=u["created_at"],
    )

async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    user_id: Optional[str] = None
    # Try JWT
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        user_id = payload.get("sub")
    except Exception:
        pass
    # Try session_token (google flow)
    if not user_id:
        sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
        if sess:
            exp = sess.get("expires_at")
            if exp:
                if exp.tzinfo is None:
                    exp = exp.replace(tzinfo=timezone.utc)
                if exp < now_utc():
                    raise HTTPException(status_code=401, detail="Session expired")
            user_id = sess["user_id"]
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

async def send_push(recipients: List[str], data: dict, idempotency_key: Optional[str] = None) -> None:
    if not recipients:
        return
    if "title" not in data or "message" not in data:
        return
    payload = {"recipients": recipients, "data": data}
    if idempotency_key:
        payload["$idempotency_key"] = idempotency_key
    try:
        resp = await _push_client.post("/api/v1/push/trigger", json=payload)
        if resp.status_code >= 400:
            logger.warning(f"push send non-2xx: {resp.status_code} {resp.text[:200]}")
    except Exception as e:
        logger.warning(f"push send failed: {e}")

# ---------- Startup ----------
@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("user_id")
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.deals.create_index([("user_id", 1), ("created_at", -1)])
    logger.info("DealHawk indexes ready")

@app.on_event("shutdown")
async def on_shutdown():
    client.close()
    await _push_client.aclose()

# ---------- Auth Routes ----------
@api.post("/auth/signup", response_model=AuthResponse)
async def signup(body: SignupBody):
    email = body.email.lower()
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    user_doc = {
        "user_id": user_id,
        "email": email,
        "name": body.name or email.split("@")[0],
        "picture": None,
        "password_hash": hash_password(body.password),
        "provider": "password",
        "created_at": now_utc(),
    }
    await db.users.insert_one(user_doc)
    token = make_jwt(user_id)
    return AuthResponse(token=token, user=user_to_out(user_doc))

@api.post("/auth/login", response_model=AuthResponse)
async def login(body: LoginBody):
    email = body.email.lower()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not user.get("password_hash"):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = make_jwt(user["user_id"])
    return AuthResponse(token=token, user=user_to_out(user))

@api.post("/auth/google/session", response_model=AuthResponse)
async def google_session(body: GoogleSessionBody):
    # Verify session_token with Emergent
    async with httpx.AsyncClient(timeout=10.0) as hc:
        try:
            resp = await hc.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": body.session_token},
            )
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"OAuth provider unreachable: {e}")
        if resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid Google session")
        data = resp.json()
    email = (data.get("email") or "").lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email not provided by Google")
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user_doc = {
            "user_id": user_id,
            "email": email,
            "name": data.get("name") or email.split("@")[0],
            "picture": data.get("picture"),
            "password_hash": None,
            "provider": "google",
            "created_at": now_utc(),
        }
        await db.users.insert_one(user_doc)
        user = user_doc
    # Persist session
    await db.user_sessions.update_one(
        {"session_token": body.session_token},
        {"$set": {
            "session_token": body.session_token,
            "user_id": user["user_id"],
            "expires_at": now_utc() + timedelta(days=7),
            "created_at": now_utc(),
        }},
        upsert=True,
    )
    return AuthResponse(token=body.session_token, user=user_to_out(user))

@api.get("/auth/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    return user_to_out(user)

@api.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]
        await db.user_sessions.delete_one({"session_token": token})
    return {"status": "ok"}

# ---------- Push ----------
@api.post("/register-push", status_code=201)
async def register_push(body: RegisterPushBody, user: dict = Depends(get_current_user)):
    if body.user_id != user["user_id"]:
        body.user_id = user["user_id"]
    try:
        resp = await _push_client.post("/api/v1/push/users/register", json=body.model_dump())
        if resp.status_code == 401:
            raise HTTPException(500, "EMERGENT_PUSH_KEY missing or invalid")
        if resp.status_code >= 500:
            raise HTTPException(502, "Push provider unavailable")
        resp.raise_for_status()
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"register-push failed: {e}")
        raise HTTPException(status_code=502, detail="Push register failed")
    return {"status": "registered"}

# ---------- AI Analysis ----------
ANALYSIS_SYSTEM_PROMPT = """You are DealHawk AI, an expert second-hand market analyst for Facebook Marketplace deals.

Given a listing's title (optional), price (optional), location (optional), category (optional), condition (optional), seller's description (optional), user notes, and optionally photos, you produce a structured assessment.

Output STRICT JSON with EXACTLY these keys:
{
  "inferred_title": "<short item description; copy the user's title if it was given, otherwise infer from photos>",
  "inferred_category": "<one of: electronics, furniture, vehicles, tools, collectibles, appliances, free, other — copy user's if given, otherwise pick based on photos/description>",
  "inferred_location": "<copy user's location if given; otherwise infer from any visible address/neighborhood/license-plate/street signs in photos, OR leave empty string if truly unknown>",
  "inferred_seller_description": "<copy user's seller_description if given; otherwise produce a 1-2 sentence description that a seller would write based on what you see in the photos>",
  "inferred_price": <copy user's price as a number if given (>0); otherwise infer a likely asking price from photos (e.g. a visible price tag or sticker) — if completely unknown, use the resale value as a placeholder>,
  "deal_score": <integer 1-10, where 10 = exceptional deal>,
  "estimated_resale_value": <number, realistic resale price in USD>,
  "max_price_to_pay": <number, the max someone should pay to still profit>,
  "expected_profit": <number, estimated_resale_value - asking price - reasonable fees>,
  "risk_warning": "<one short sentence summarizing scam/risk likelihood>",
  "red_flags": ["<short red flag>", "..."],
  "suggested_negotiation_message": "<a friendly, polite message the buyer can send the seller to negotiate>",
  "recommendation": "<one of: buy, negotiate, watch, skip>",
  "reasoning": "<2-3 sentences explaining the score>",
  "market_data": {
    "buyer_demand": "<1-2 sentences on buyer demand for this item in the buyer's location>",
    "seller_competition": "<1-2 sentences estimating how many similar listings exist locally>",
    "local_price_range": "<typical local resale price range, e.g. '$420-$520 in major US metros'>",
    "notes": "<any regional caveat>"
  }
}

Rules:
- If no title is provided, you MUST identify the item from the photos and put that in inferred_title (be specific: brand, model, capacity/size, color).
- If no category is provided, pick one from the allowed list based on the item.
- If no location is provided, attempt to infer from photo cues (street signs, plates) — otherwise empty string.
- If no seller_description is provided, write a plausible 1-2 sentence description of what you observe in the photos.
- If no price (or price <= 0) is provided, look for a price tag/sticker in the photos; if none, use estimated_resale_value as a fallback inferred_price.
- If neither title NOR readable photos are provided, return inferred_title="Unknown item" and a low deal_score with risk_warning explaining that the item can't be identified.
- Be realistic about resale value (US market). If unsure, lean conservative.
- If suspicious (stock photo signs, vague desc, too good to be true), recommend 'skip' and add red flags.
- market_data: always populate when a non-empty location (provided or inferred) is given.
- Return ONLY the JSON object, no markdown fences, no commentary.
"""

def _strip_json(text: str) -> str:
    t = text.strip()
    # remove ```json ... ``` fences if any
    if t.startswith("```"):
        t = re.sub(r"^```[a-zA-Z]*\n?", "", t)
        if t.endswith("```"):
            t = t[:-3]
    return t.strip()

def _parse_image_b64(s: str) -> Optional[str]:
    if not s:
        return None
    if s.startswith("data:"):
        # data:image/jpeg;base64,XXXX
        try:
            return s.split(",", 1)[1]
        except Exception:
            return None
    return s

@api.post("/analyze", response_model=DealAnalysisResult)
async def analyze_deal(body: AnalyzeBody, user: dict = Depends(get_current_user)):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="LLM key not configured")

    n_imgs = len([1 for img in body.images[:4] if _parse_image_b64(img)])
    has_title = bool((body.title or "").strip())
    has_price = body.price is not None and float(body.price) > 0
    if not has_title and n_imgs == 0:
        raise HTTPException(
            status_code=400,
            detail="Add a title or at least one photo so we can identify the item.",
        )

    if n_imgs > 0:
        photo_instr = (
            f"\n\nIMPORTANT: {n_imgs} listing photo(s) are attached to this message. "
            "INSPECT EACH PHOTO carefully. Use them to:\n"
            "- Verify the item matches the title (catch wrong-item bait-and-switch).\n"
            "- Judge actual condition (scratches, wear, damage, missing accessories) and reconcile vs the seller's stated condition.\n"
            "- Spot scam indicators (obvious stock photos, watermarked images, screenshots of other listings, blurry/low-effort photos, mismatched backgrounds).\n"
            "- Identify model/specs (e.g. iPhone storage badge, brand stickers, serial labels) that affect resale value.\n"
            "- Look for price tags/stickers if no price was provided, and any location cues (street signs, license plates) if no location was provided.\n"
            "Reflect what you SAW in the photos inside the red_flags array and reasoning."
        )
    else:
        photo_instr = "\n\nNo photos were attached. Note this in your reasoning since it materially limits confidence."

    missing_fields = []
    if not has_title:
        missing_fields.append("title")
    if not has_price:
        missing_fields.append("price")
    if not (body.location or "").strip():
        missing_fields.append("location")
    if not (body.category or "").strip():
        missing_fields.append("category")
    if not (body.seller_description or "").strip():
        missing_fields.append("seller_description")
    if missing_fields and n_imgs > 0:
        photo_instr += (
            "\n\nThe user did not provide: "
            + ", ".join(missing_fields)
            + ". You MUST infer each missing field from the photos and populate the corresponding `inferred_*` JSON key with a confident value."
        )

    location_clean = (body.location or "").strip()
    if location_clean:
        market_instr = (
            f"\n\nThe buyer is in: {location_clean}. Populate `market_data` with buyer demand, "
            "seller competition, local price range, and any regional notes specific to that area."
        )
    else:
        market_instr = "\n\nNo location given. If you infer a location from photos, use it for market_data. Otherwise return market_data with empty strings."

    user_prompt = f"""Evaluate this Facebook Marketplace listing.

Title: {body.title.strip() if has_title else '(not provided — identify from photos)'}
Asking price: {f'${body.price}' if has_price else '(not provided — infer from photos)'}
Location: {location_clean or '(not provided — infer from photos)'}
Category: {(body.category or '').strip() or '(not provided — infer from photos)'}
Condition: {body.condition or 'not provided'}
Seller description: {body.seller_description or '(not provided — write one from photos)'}
Buyer notes: {body.notes or 'none'}
{photo_instr}
{market_instr}

Return only the JSON object as instructed."""

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"analyze_{user['user_id']}_{uuid.uuid4().hex[:8]}",
        system_message=ANALYSIS_SYSTEM_PROMPT,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")

    file_contents = []
    for img in body.images[:4]:
        b64 = _parse_image_b64(img)
        if b64:
            file_contents.append(ImageContent(image_base64=b64))

    msg = UserMessage(text=user_prompt, file_contents=file_contents or None)
    try:
        response = await chat.send_message(msg)
    except Exception as e:
        logger.exception("LLM call failed")
        raise HTTPException(status_code=502, detail=f"AI analysis failed: {e}")

    text = response if isinstance(response, str) else str(response)
    cleaned = _strip_json(text)
    try:
        data = json.loads(cleaned)
    except Exception:
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if not match:
            raise HTTPException(status_code=502, detail="AI returned non-JSON output")
        data = json.loads(match.group(0))

    md_raw = data.get("market_data") or {}
    if not isinstance(md_raw, dict):
        md_raw = {}
    market = MarketData(
        buyer_demand=str(md_raw.get("buyer_demand", "")),
        seller_competition=str(md_raw.get("seller_competition", "")),
        local_price_range=str(md_raw.get("local_price_range", "")),
        notes=str(md_raw.get("notes", "")),
    )

    try:
        inferred_price_raw = data.get("inferred_price")
        try:
            inferred_price_val = float(inferred_price_raw) if inferred_price_raw is not None else None
        except (TypeError, ValueError):
            inferred_price_val = None
        result = DealAnalysisResult(
            deal_score=int(round(float(data.get("deal_score", 5)))),
            inferred_title=(str(data.get("inferred_title", "")).strip() or (body.title.strip() if has_title else None)),
            inferred_category=(str(data.get("inferred_category", "")).strip().lower() or None),
            inferred_location=(str(data.get("inferred_location", "")).strip() or None),
            inferred_seller_description=(str(data.get("inferred_seller_description", "")).strip() or None),
            inferred_price=inferred_price_val,
            estimated_resale_value=float(data.get("estimated_resale_value", 0) or 0),
            max_price_to_pay=float(data.get("max_price_to_pay", 0) or 0),
            expected_profit=float(data.get("expected_profit", 0) or 0),
            risk_warning=str(data.get("risk_warning", "")),
            red_flags=[str(x) for x in (data.get("red_flags") or [])],
            suggested_negotiation_message=str(data.get("suggested_negotiation_message", "")),
            recommendation=str(data.get("recommendation", "watch")).lower(),
            reasoning=str(data.get("reasoning", "")) if data.get("reasoning") else None,
            market_data=market,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI response shape invalid: {e}")

    if result.recommendation not in {"buy", "negotiate", "watch", "skip"}:
        result.recommendation = "watch"
    if result.deal_score < 1:
        result.deal_score = 1
    if result.deal_score > 10:
        result.deal_score = 10
    return result

# ---------- Deals CRUD ----------
@api.post("/deals", response_model=Deal)
async def save_deal(body: SaveDealBody, user: dict = Depends(get_current_user)):
    deal_id = f"deal_{uuid.uuid4().hex[:12]}"
    now = now_utc()
    a = body.analysis

    title = (body.title or "").strip()
    title_inferred = False
    if not title and a and a.inferred_title:
        title = a.inferred_title
        title_inferred = True
    if not title:
        title = "Untitled listing"

    price = float(body.price) if body.price and float(body.price) > 0 else 0.0
    price_inferred = False
    if price <= 0 and a and a.inferred_price and a.inferred_price > 0:
        price = float(a.inferred_price)
        price_inferred = True

    category = (body.category or "").strip().lower()
    category_inferred = False
    if not category and a and a.inferred_category:
        category = a.inferred_category
        category_inferred = True
    if not category:
        category = "other"

    location = (body.location or "").strip()
    location_inferred = False
    if not location and a and a.inferred_location:
        location = a.inferred_location
        location_inferred = True

    seller_description = (body.seller_description or "").strip()
    seller_description_inferred = False
    if not seller_description and a and a.inferred_seller_description:
        seller_description = a.inferred_seller_description
        seller_description_inferred = True

    inferred_fields = []
    if title_inferred:
        inferred_fields.append("title")
    if price_inferred:
        inferred_fields.append("price")
    if category_inferred:
        inferred_fields.append("category")
    if location_inferred:
        inferred_fields.append("location")
    if seller_description_inferred:
        inferred_fields.append("seller_description")

    deal = {
        "deal_id": deal_id,
        "user_id": user["user_id"],
        "title": title,
        "price": price,
        "location": location,
        "category": category,
        "condition": body.condition or "",
        "seller_description": seller_description,
        "notes": body.notes or "",
        "listing_url": (body.listing_url or "").strip(),
        "images": body.images,
        "status": body.status or "new",
        "analysis": a.model_dump() if a else None,
        "last_checked_at": None,
        "price_history": [{"price": price, "at": now}] if price > 0 else [],
        "inferred_fields": inferred_fields,
        "created_at": now,
        "updated_at": now,
    }
    await db.deals.insert_one(deal.copy())
    return Deal(**deal)

@api.get("/deals", response_model=List[Deal])
async def list_deals(
    user: dict = Depends(get_current_user),
    status: Optional[str] = None,
    category: Optional[str] = None,
    sort: Optional[str] = "recent",  # recent | profit | score
):
    q = {"user_id": user["user_id"]}
    if status:
        q["status"] = status
    if category and category != "all":
        q["category"] = category
    cursor = db.deals.find(q, {"_id": 0})
    docs = await cursor.to_list(length=500)
    if sort == "profit":
        docs.sort(key=lambda d: (d.get("analysis") or {}).get("expected_profit", 0) or 0, reverse=True)
    elif sort == "score":
        docs.sort(key=lambda d: (d.get("analysis") or {}).get("deal_score", 0) or 0, reverse=True)
    else:
        docs.sort(key=lambda d: d.get("created_at", now_utc()), reverse=True)
    return [Deal(**d) for d in docs]

@api.get("/deals/{deal_id}", response_model=Deal)
async def get_deal(deal_id: str, user: dict = Depends(get_current_user)):
    d = await db.deals.find_one({"deal_id": deal_id, "user_id": user["user_id"]}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Deal not found")
    return Deal(**d)

@api.patch("/deals/{deal_id}", response_model=Deal)
async def update_deal(deal_id: str, body: UpdateDealBody, user: dict = Depends(get_current_user)):
    existing = await db.deals.find_one({"deal_id": deal_id, "user_id": user["user_id"]}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Deal not found")

    updates: dict = {"updated_at": now_utc()}
    push_ops: dict = {}
    if body.status is not None:
        updates["status"] = body.status
    if body.notes is not None:
        updates["notes"] = body.notes
    if body.listing_url is not None:
        updates["listing_url"] = body.listing_url.strip()
    if body.mark_checked:
        updates["last_checked_at"] = now_utc()
    if body.price is not None:
        new_price = float(body.price)
        updates["price"] = new_price
        if abs(new_price - float(existing.get("price", 0) or 0)) > 1e-6:
            push_ops["price_history"] = {"price": new_price, "at": now_utc()}

    mongo_update: dict = {"$set": updates}
    if push_ops:
        mongo_update["$push"] = push_ops

    res = await db.deals.find_one_and_update(
        {"deal_id": deal_id, "user_id": user["user_id"]},
        mongo_update,
        return_document=True,
        projection={"_id": 0},
    )
    if not res:
        raise HTTPException(status_code=404, detail="Deal not found")
    return Deal(**res)

@api.post("/deals/{deal_id}/refresh-analysis", response_model=Deal)
async def refresh_analysis(deal_id: str, user: dict = Depends(get_current_user)):
    """Re-run AI analysis using the deal's stored fields (incl. current price)."""
    d = await db.deals.find_one({"deal_id": deal_id, "user_id": user["user_id"]}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Deal not found")
    body = AnalyzeBody(
        title=d.get("title", ""),
        price=float(d.get("price", 0)),
        location=d.get("location", ""),
        category=d.get("category", "other"),
        condition=d.get("condition", ""),
        seller_description=d.get("seller_description", ""),
        notes=d.get("notes", ""),
        images=d.get("images", []),
    )
    new_analysis = await analyze_deal(body, user)
    res = await db.deals.find_one_and_update(
        {"deal_id": deal_id, "user_id": user["user_id"]},
        {"$set": {"analysis": new_analysis.model_dump(), "updated_at": now_utc()}},
        return_document=True,
        projection={"_id": 0},
    )
    return Deal(**res)

@api.delete("/deals/{deal_id}")
async def delete_deal(deal_id: str, user: dict = Depends(get_current_user)):
    res = await db.deals.delete_one({"deal_id": deal_id, "user_id": user["user_id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Deal not found")
    return {"status": "deleted"}

@api.get("/dashboard")
async def dashboard(user: dict = Depends(get_current_user)):
    docs = await db.deals.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(length=500)
    total_deals = len(docs)
    total_profit = sum((d.get("analysis") or {}).get("expected_profit", 0) or 0 for d in docs)
    by_status = {}
    for d in docs:
        by_status[d.get("status", "new")] = by_status.get(d.get("status", "new"), 0) + 1
    top_deals = sorted(
        docs,
        key=lambda d: ((d.get("analysis") or {}).get("expected_profit", 0) or 0),
        reverse=True,
    )[:5]
    return {
        "total_deals": total_deals,
        "potential_profit": round(total_profit, 2),
        "by_status": by_status,
        "top_deals": [Deal(**d).model_dump() for d in top_deals],
    }

@api.post("/reminders/test")
async def test_reminder(user: dict = Depends(get_current_user)):
    """Trigger a test push to the current user."""
    await send_push(
        recipients=[user["user_id"]],
        data={"title": "DealHawk", "message": "This is your test reminder. New deals await!"},
    )
    return {"status": "sent"}

@api.get("/locations/search")
async def locations_search(q: str = "", user: dict = Depends(get_current_user)):
    """Autocomplete city/place suggestions via OpenStreetMap Nominatim (free, no key)."""
    q = (q or "").strip()
    if len(q) < 2:
        return {"results": []}
    try:
        async with httpx.AsyncClient(timeout=8.0) as hc:
            resp = await hc.get(
                "https://nominatim.openstreetmap.org/search",
                params={
                    "q": q,
                    "format": "json",
                    "addressdetails": 1,
                    "limit": 6,
                    "featuretype": "city",
                },
                headers={"User-Agent": "DealHawkAI/1.0 (deal-evaluator)"},
            )
        if resp.status_code != 200:
            return {"results": []}
        data = resp.json()
        out = []
        for item in data:
            addr = item.get("address", {}) or {}
            city = (
                addr.get("city")
                or addr.get("town")
                or addr.get("village")
                or addr.get("hamlet")
                or addr.get("county")
                or item.get("name")
                or ""
            )
            state = addr.get("state") or addr.get("region") or ""
            country = addr.get("country") or ""
            label_parts = [p for p in [city, state, country] if p]
            label = ", ".join(label_parts)
            if not label:
                label = item.get("display_name", "")
            if label:
                out.append({"label": label, "display_name": item.get("display_name", label)})
        # dedupe
        seen = set()
        uniq = []
        for r in out:
            if r["label"] in seen:
                continue
            seen.add(r["label"])
            uniq.append(r)
        return {"results": uniq[:6]}
    except Exception as e:
        logger.warning(f"locations_search failed: {e}")
        return {"results": []}

@api.get("/")
async def root():
    return {"app": "DealHawk AI", "ok": True}

# ---------- Middleware / mount ----------
app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
