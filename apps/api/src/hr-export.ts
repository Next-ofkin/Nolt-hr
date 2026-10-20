import { BadRequestException, Controller, ForbiddenException, Get, Inject, Injectable, NotFoundException, Param, ParseUUIDPipe, Req, Res, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { deflateRawSync } from "node:zlib";
import sharp from "sharp";
import { Database } from "./database.js";
import { FilesService } from "./files.js";
import { SessionGuard, type AuthRequest } from "./auth.js";

type Image = { data: Buffer; width: number; height: number; name: string };
const safe = (v: string) => v.replace(/[^\w .-]+/g, "_").slice(0, 90).trim() || "document";
const ascii = (v: unknown) => String(v ?? "").normalize("NFKD").replace(/[^\x20-\x7e]/g, "?");
const escapePdf = (v: string) => ascii(v).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
const crcTable = Array.from({ length: 256 }, (_, i) => {
  let c = i; for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0;
});
function crc32(b: Buffer) { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
export function zipFiles(entries: {name: string; bytes: Buffer}[]): Buffer {
  const local: Buffer[] = []; const central: Buffer[] = []; let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8"); const data = entry.bytes;
    const packed = deflateRawSync(data); const checksum = crc32(data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x800, 6); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(checksum, 14); lh.writeUInt32LE(packed.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26);
    local.push(lh, name, packed);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x800, 8);
    ch.writeUInt16LE(8, 10); ch.writeUInt32LE(checksum, 16); ch.writeUInt32LE(packed.length, 20); ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(offset, 42); central.push(ch, name);
    offset += lh.length + name.length + packed.length;
  }
  const directory = Buffer.concat(central); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}

class PdfDocument {
  private pages: { lines: string[]; images: Image[]; y: number }[] = [];
  private page = this.next();
  private next() {
    const page = { lines: [] as string[], images: [] as Image[], y: 780 };
    this.pages.push(page); return page;
  }
  private ensure(space: number) { if (this.page.y - space < 65) this.page = this.next(); }
  text(value: unknown, size = 11, bold = false, gap = 8) {
    const content = ascii(value);
    const max = Math.max(22, Math.floor(94 * 11 / size));
    const words = content.split(/\s+/); let line = "";
    const emit = (v: string) => {
      this.ensure(size + gap);
      this.page.lines.push(`BT /F${bold ? 2 : 1} ${size} Tf 48 ${this.page.y} Td (${escapePdf(v)}) Tj ET`);
      this.page.y -= size + gap;
    };
    for (let word of words) {
      while (word.length > max) { if (line) { emit(line); line = ""; } emit(word.slice(0, max)); word = word.slice(max); }
      if ((line + " " + word).trim().length > max) { emit(line); line = word; } else line = (line + " " + word).trim();
    }
    if (line) emit(line); if (!words.length) emit("");
  }
  image(bytes: Buffer, dimensions: {width:number;height:number}, label: string) {
    const width = Math.min(250, dimensions.width), height = Math.min(215, width * dimensions.height / dimensions.width);
    this.ensure(height + 28);
    const name = `Im${this.page.images.length+1}`;
    this.page.images.push({data:bytes,width:dimensions.width,height:dimensions.height,name});
    this.page.lines.push(`q ${width.toFixed(1)} 0 0 ${height.toFixed(1)} 48 ${(this.page.y-height).toFixed(1)} cm /${name} Do Q`);
    this.page.y -= height + 10; this.text(label, 9);
  }
  build() {
    type Obj = Buffer;
    const objects: Obj[] = [Buffer.alloc(0)];
    const put = (value: Buffer | string) => { objects.push(typeof value === "string" ? Buffer.from(value, "latin1") : value); return objects.length - 1; };
    const font1 = put("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    const font2 = put("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
    const pagesId = put("");
    const pageIds: number[] = [];
    for (const [index, page] of this.pages.entries()) {
      page.lines.push(`BT /F1 8 Tf 48 35 Td (NOLT HR | Confidential | Page ${index+1} of ${this.pages.length}) Tj ET`);
      const imRefs: string[] = [];
      for (const img of page.images) {
        const header = Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.data.length} >>\nstream\n`);
        const id = put(Buffer.concat([header,img.data,Buffer.from("\nendstream")]));
        imRefs.push(`/${img.name} ${id} 0 R`);
      }
      const commands = Buffer.from(page.lines.join("\n"), "latin1");
      const contentId = put(Buffer.concat([Buffer.from(`<< /Length ${commands.length} >>\nstream\n`),commands,Buffer.from("\nendstream")]));
      pageIds.push(put(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font1} 0 R /F2 ${font2} 0 R >> /XObject << ${imRefs.join(" ")} >> >> /Contents ${contentId} 0 R >>`));
    }
    objects[pagesId] = Buffer.from(`<< /Type /Pages /Kids [${pageIds.map(id=>id+" 0 R").join(" ")}] /Count ${pageIds.length} >>`);
    const catalog = put(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
    const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n")]; const offsets=[0]; let offset=chunks[0].length;
    for(let i=1;i<objects.length;i++) { offsets[i]=offset; const b=Buffer.concat([Buffer.from(`${i} 0 obj\n`),objects[i],Buffer.from("\nendobj\n")]);chunks.push(b); offset+=b.length; }
    const xref = offset;
    chunks.push(Buffer.from(`xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets.slice(1).map(v=>String(v).padStart(10,"0")+" 00000 n \n").join("")}trailer\n<< /Size ${objects.length} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`));
    return Buffer.concat(chunks);
  }
}

@Injectable()
export class HrExportService {
  constructor(@Inject(Database) private db: Database, @Inject(FilesService) private files: FilesService) {}
  private async form(userId: string, assignmentId: string) {
    const assignment = await this.db.formAssignment.findUnique({
      where: {id:assignmentId}, include: { formVersion: true, onboardingCase: {include:{employee:true}},
        response: true, submissions: {orderBy:{version:"desc"},take:1,include:{review:true}} },
    });
    if (!assignment || assignment.formVersion.recipient !== "EMPLOYEE" || !assignment.submissions.length)
      throw new NotFoundException("Completed employee submission not found.");
    const user=await this.db.user.findUnique({where:{id:userId}});
    if (!user?.active || user.role !== "HR") throw new ForbiddenException("Active HR access required.");
    return assignment;
  }
  async render(userId:string, assignmentId:string) {
    const a=await this.form(userId,assignmentId); const submission=a.submissions[0];
    const doc=new PdfDocument(); const supporting:{name:string;bytes:Buffer}[]=[];
    doc.text("NOLT HR | COMPLETED EMPLOYEE FORM",17,true,12);
    doc.text(a.formVersion.title,15,true,14);
    doc.text(`Employee: ${a.onboardingCase.employee.fullName} | ${a.onboardingCase.employee.email}`);
    doc.text(`Form version: ${a.formVersion.version} | Submission: ${submission.version} | Submitted: ${submission.submittedAt.toISOString()}`,9);
    doc.text(`Review status: ${submission.review?.decision ?? "AWAITING REVIEW"}`,10,true);
    if(submission.review) doc.text(`Reviewed: ${submission.review.reviewedAt.toISOString()} | Reviewer record: ${submission.review.reviewedBy}`,9);
    doc.text("SUBMITTED ANSWERS",12,true,12);
    const fields = a.formVersion.fields as unknown;
    if (!Array.isArray(fields)) throw new BadRequestException("Invalid form definition.");
    const answers = submission.answers as Record<string,unknown>;
    for(const field of fields) {
      if (!field || typeof field !== "object") continue;
      const f=field as {id?:string;label?:string;type?:string};
      if(!f.id) continue;
      doc.text(f.label??"Field",11,true,4);
      const raw=answers[f.id];
      if(raw===null || raw===undefined || raw==="") {doc.text("(Not answered)",10);continue;}
      if(["passport_photo","signature","file"].includes(f.type??"")) {
        if(typeof raw!=="string" || !/^[0-9a-f-]{36}$/i.test(raw)) {doc.text("(Attachment unavailable)",10);continue;}
        const file=await this.files.downloadFile(userId,raw);
        if(f.type==="file") {
          const filename=safe(file.fileName);
          supporting.push({name:`Supporting_Documents/${safe(a.formVersion.title)}/${String(supporting.length+1).padStart(2,"0")}_${filename}`,bytes:file.buffer});
          doc.text(`Attached document: ${filename} (original included in pack ZIP)`,10);
        } else {
          if(!file.mimeType.startsWith("image/")) {doc.text("(Invalid image evidence)",10);continue;}
          const image=sharp(file.buffer).rotate().flatten({background:"#ffffff"});
          const metadata=await image.metadata();
          const data=await image.jpeg({quality:88}).toBuffer();
          doc.image(data,{width:metadata.width??400,height:metadata.height??400}, f.type==="signature"?"Electronically captured employee signature":"Employee passport photograph");
        }
      } else doc.text(typeof raw==="boolean"?(raw?"Yes":"No"):typeof raw==="string"?raw:JSON.stringify(raw),10);
    }
    doc.text(`Evidence reference: ${submission.id} | Form version reference: ${submission.formVersionId}`,8);
    return {pdf:doc.build(),attachments:supporting,employee:safe(a.onboardingCase.employee.fullName),title:safe(a.formVersion.title),version:submission.version,review:submission.review?.decision??"AWAITING_REVIEW"};
  }
  async pack(userId:string, packAssignmentId:string) {
    const user=await this.db.user.findUnique({where:{id:userId}});
    if(!user?.active || user.role!=="HR") throw new ForbiddenException("Active HR access required.");
    const pack=await this.db.packAssignment.findUnique({where:{id:packAssignmentId},include:{
      pack:true,onboardingCase:{include:{employee:true}},forms:{orderBy:{position:"asc"}}
    }});
    if(!pack) throw new NotFoundException("Assigned pack not found.");
    const employee=safe(pack.onboardingCase.employee.fullName);
    const root=`${employee}_${safe(pack.pack.name)}`;
    const entries:{name:string;bytes:Buffer}[]=[];const summary:string[]=[
      "NOLT HR - ONBOARDING PACK EXPORT",`Employee: ${pack.onboardingCase.employee.fullName}`,`Pack: ${pack.pack.name}`,`Exported: ${new Date().toISOString()}`, "Forms:"];
    for(const [index,part] of pack.forms.entries()) {
      try {
        const form=await this.render(userId,part.formAssignmentId);
        const prefix=String(index+1).padStart(2,"0");
        entries.push({name:`${root}/${prefix}_${form.title}.pdf`,bytes:form.pdf});
        for(const item of form.attachments) entries.push({name:`${root}/${item.name}`,bytes:item.bytes});
        summary.push(`${prefix}. ${form.title} | Submission v${form.version} | ${form.review}`);
      } catch (error) {
        if(!(error instanceof NotFoundException)) throw error;
        summary.push(`${index+1}. Assignment ${part.formAssignmentId} | NOT SUBMITTED`);
      }
    }
    const info=new PdfDocument();for(const line of summary) info.text(line,11);
    entries.unshift({name:`${root}/00_Pack_Summary.pdf`,bytes:info.build()});
    if(entries.length>160)throw new BadRequestException("Pack contains too many attachments to export.");
    return {buffer:zipFiles(entries),filename:`${root}.zip`};
  }
}
@ApiTags("HR PDF and pack exports")
@UseGuards(SessionGuard)
@Controller("exports")
export class HrExportController {
  constructor(@Inject(HrExportService) private readonly exports:HrExportService){}
  @Get("forms/:id.pdf")
  async form(@Req() req:AuthRequest,@Param("id",ParseUUIDPipe) id:string,@Res() res:Response) {
    const doc=await this.exports.render(req.actor.id,id);
    res.setHeader("Content-Type","application/pdf");
    res.setHeader("Content-Disposition",`attachment; filename="${doc.employee}_${doc.title}.pdf"`);
    res.setHeader("Cache-Control","private, no-store");res.setHeader("X-Content-Type-Options","nosniff");
    res.send(doc.pdf);
  }
  @Get("packs/:id.zip")
  async pack(@Req() req:AuthRequest,@Param("id",ParseUUIDPipe) id:string,@Res() res:Response) {
    const archive=await this.exports.pack(req.actor.id,id);
    res.setHeader("Content-Type","application/zip");
    res.setHeader("Content-Disposition",`attachment; filename="${archive.filename}"`);
    res.setHeader("Cache-Control","private, no-store");res.setHeader("X-Content-Type-Options","nosniff");
    res.send(archive.buffer);
  }
}
